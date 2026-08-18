// Exercises releaseDuePayouts()'s decision logic directly against the live
// Supabase project — not mocks — but skips real Stripe charges entirely
// (bookings/payments are inserted directly) since these cases are about the
// release job's own money math and state transitions, not the charge/refund
// paths already covered by money-path.integration.test.ts. The one path this
// can't cover without a live Stripe Connect Express account (a successful
// transfer) is verified separately via the hosted onboarding flow in a real
// browser — see the payout task's notes.
//
// Run via `npm run test:integration` (see vitest.integration.config.ts).
// Skips itself if live credentials aren't present, or if STRIPE_SECRET_KEY
// isn't a test key — this must never be able to run against live Stripe.
import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

// releaseDuePayouts pulls in src/lib/email.ts transitively (for the
// payout-failed admin alert) — email.ts constructs a real Resend client at
// module load time, which throws if RESEND_API_KEY isn't set in this test
// run. Same mock pattern as money-path.integration.test.ts.
vi.mock('@/lib/email', () => ({
  sendAdminAlertEmail: vi.fn(() => Promise.resolve()),
}))

const ROOT = path.resolve(__dirname, '..', '..', '..')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return
  const lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvLocal()

const hasLiveCreds = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.STRIPE_SECRET_KEY
)
const isTestStripeKey = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? false

const CUSTOMER_EMAIL = 'e2e-payoutrelease-customer@example.com'
const CLEANER_EMAIL  = 'e2e-payoutrelease-cleaner@example.com'
const DUMMY_PASSWORD_HASH = '$2b$12$K3q8h5x2u1S9v0z7y6w5x.OeQyq8h5x2u1S9v0z7y6w5xOeQyq8h5x'
const PAST_COMPLETION = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // well past the 24h hold

describe.skipIf(!hasLiveCreds || !isTestStripeKey)('Payout release (live DB, no live Connect account)', () => {
  let admin: SupabaseClient
  let releaseDuePayouts: typeof import('../../lib/payouts')['releaseDuePayouts']
  let customerId: string
  let cleanerUserId: string
  let cleanerProfileId: string
  let introductionId: string

  beforeAll(async () => {
    ;({ releaseDuePayouts } = await import('../../lib/payouts'))
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: existing } = await admin.from('users').select('id').in('email', [CUSTOMER_EMAIL, CLEANER_EMAIL])
    if (existing?.length) await admin.from('users').delete().in('id', existing.map(u => u.id))

    const { data: customer, error: customerErr } = await admin.from('users').insert({
      email: CUSTOMER_EMAIL, password_hash: DUMMY_PASSWORD_HASH, role: 'CUSTOMER',
      full_name: 'E2E Payout Release Customer', email_verified: true,
    }).select('id').single()
    if (customerErr || !customer) throw new Error(`Failed to create test customer: ${customerErr?.message}`)
    customerId = customer.id

    const { data: cleanerUser, error: cleanerErr } = await admin.from('users').insert({
      email: CLEANER_EMAIL, password_hash: DUMMY_PASSWORD_HASH, role: 'CLEANER',
      full_name: 'E2E Payout Release Cleaner', email_verified: true,
    }).select('id').single()
    if (cleanerErr || !cleanerUser) throw new Error(`Failed to create test cleaner: ${cleanerErr?.message}`)
    cleanerUserId = cleanerUser.id

    // No stripe_connect_account_id — deliberately, so a due payout here can
    // only ever land on BLOCKED, never attempt a real transfer.
    const { data: cleanerProfile, error: profileErr } = await admin.from('cleaner_profiles').insert({
      user_id: cleanerUserId, slug: 'e2e-payoutrelease-cleaner', display_name: 'E2E Payout Release Cleaner',
      city: 'Limassol', hourly_rate_eur: 20, services: ['HOUSE'], status: 'ACTIVE',
    }).select('id').single()
    if (profileErr || !cleanerProfile) throw new Error(`Failed to create test cleaner profile: ${profileErr?.message}`)
    cleanerProfileId = cleanerProfile.id

    const { data: intro, error: introErr } = await admin.from('introductions').insert({
      customer_id: customerId, cleaner_profile_id: cleanerProfileId,
    }).select('id').single()
    if (introErr || !intro) throw new Error(`Failed to create test introduction: ${introErr?.message}`)
    introductionId = intro.id
  })

  afterAll(async () => {
    if (customerId || cleanerUserId) {
      await admin.from('users').delete().in('id', [customerId, cleanerUserId].filter(Boolean))
    }
  })

  // Inserts a COMPLETED booking (completed 48h ago, well past the hold) with
  // a matching payments row, optionally with a resolved dispute attached.
  async function makeCompletedBooking(opts: { refundPercentage?: number }) {
    const { data: booking, error: bookingErr } = await admin.from('bookings').insert({
      introduction_id: introductionId, customer_id: customerId, cleaner_profile_id: cleanerProfileId,
      service_type: 'HOUSE', date: new Date().toISOString().slice(0, 10), start_time: '10:00',
      duration_hours: 2, status: 'COMPLETED', completed_at: PAST_COMPLETION,
    }).select('id').single()
    if (bookingErr || !booking) throw new Error(`Failed to create booking: ${bookingErr?.message}`)

    // rate 20 x 2h = 40, + BOOKING_FEE_EUR (0.5) = 40.5 total charged
    const { error: paymentErr } = await admin.from('payments').insert({
      booking_id: booking.id, amount_eur: 40.5, platform_fee_eur: 0.5, status: 'PAID',
    })
    if (paymentErr) throw new Error(`Failed to create payment: ${paymentErr.message}`)

    if (opts.refundPercentage !== undefined) {
      const { error: disputeErr } = await admin.from('disputes').insert({
        booking_id: booking.id, customer_id: customerId, cleaner_profile_id: cleanerProfileId,
        claim: 'test claim', status: 'RESOLVED', resolution: opts.refundPercentage === 100 ? 'CUSTOMER' : 'UNRESOLVABLE',
        refund_percentage: opts.refundPercentage, resolved_at: new Date().toISOString(),
      })
      if (disputeErr) throw new Error(`Failed to create dispute: ${disputeErr.message}`)
    }

    return booking.id
  }

  it('queues a due payout as BLOCKED when the cleaner has no Connect account, at the full rate', async () => {
    const bookingId = await makeCompletedBooking({})
    await releaseDuePayouts(admin as never)

    const { data: payment } = await admin.from('payments')
      .select('payout_status, cleaner_payout_eur, stripe_transfer_id')
      .eq('booking_id', bookingId).single()
    expect(payment?.payout_status).toBe('BLOCKED')
    expect(payment?.cleaner_payout_eur).toBe(40) // full rate, fee excluded
    expect(payment?.stripe_transfer_id).toBeNull()
  })

  it('pays out nothing when a dispute fully refunded the customer — no transfer attempted', async () => {
    const bookingId = await makeCompletedBooking({ refundPercentage: 100 })
    await releaseDuePayouts(admin as never)

    const { data: payment } = await admin.from('payments')
      .select('payout_status, cleaner_payout_eur, stripe_transfer_id')
      .eq('booking_id', bookingId).single()
    expect(payment?.payout_status).toBe('PAID') // resolved, nothing owed — see payouts.ts's status comment
    expect(payment?.cleaner_payout_eur).toBe(0)
    expect(payment?.stripe_transfer_id).toBeNull()
  })

  it('reduces the payout proportionally on a split (UNRESOLVABLE) dispute ruling', async () => {
    const bookingId = await makeCompletedBooking({ refundPercentage: 50 })
    await releaseDuePayouts(admin as never)

    const { data: payment } = await admin.from('payments')
      .select('payout_status, cleaner_payout_eur')
      .eq('booking_id', bookingId).single()
    expect(payment?.payout_status).toBe('BLOCKED') // still no Connect account — but the amount reflects the ruling
    expect(payment?.cleaner_payout_eur).toBe(20) // 50% of the 40 EUR rate
  })

  it('does not release a booking still inside an OPEN dispute, even past the plain hold window', async () => {
    const bookingId = await makeCompletedBooking({})
    await admin.from('disputes').insert({
      booking_id: bookingId, customer_id: customerId, cleaner_profile_id: cleanerProfileId,
      claim: 'still open', status: 'OPEN',
    })
    await releaseDuePayouts(admin as never)

    const { data: payment } = await admin.from('payments')
      .select('payout_status').eq('booking_id', bookingId).single()
    expect(payment?.payout_status).toBe('PENDING') // untouched — correctly still held
  })
})
