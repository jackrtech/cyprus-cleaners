// Proves the booking-confirm double-charge race (fixed in cad29a9) actually
// holds under real concurrent load against the live DB + a real Stripe
// TEST-mode charge — not a mock, and not just "the code looks right." Fires
// two simultaneous CONFIRM requests at the same REQUESTED booking and
// verifies exactly one charge lands.
//
// Run via `npm run test:integration` (see vitest.integration.config.ts).
// Skips itself if live credentials aren't present, or if STRIPE_SECRET_KEY
// isn't a test key — this must never be able to run against live Stripe.
import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

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

vi.mock('@/lib/email', () => ({
  sendNewBookingRequestEmail:          vi.fn(() => Promise.resolve()),
  sendBookingConfirmedEmail:           vi.fn(() => Promise.resolve()),
  sendBookingConfirmedAdminAlertEmail: vi.fn(() => Promise.resolve()),
  sendBookingCompletedEmail:           vi.fn(() => Promise.resolve()),
}))

const mockGetServerSession = vi.fn()
vi.mock('next-auth/next', () => ({
  getServerSession: () => mockGetServerSession(),
}))
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }))

function sessionAs(userId: string, role: 'CUSTOMER' | 'CLEANER') {
  mockGetServerSession.mockResolvedValue({
    user: { id: userId, email: 'x@example.com', name: 'X', role, avatar_url: null },
  })
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const CUSTOMER_EMAIL = 'e2e-concurrency-customer@example.com'
const CLEANER_EMAIL = 'e2e-concurrency-cleaner@example.com'
const DUMMY_PASSWORD_HASH = '$2b$12$K3q8h5x2u1S9v0z7y6w5x.OeQyq8h5x2u1S9v0z7y6w5xOeQyq8h5x'

describe.skipIf(!hasLiveCreds || !isTestStripeKey)('Booking confirm concurrency (live DB + Stripe test mode)', () => {
  let admin: SupabaseClient
  let stripe: Stripe
  let customerId: string
  let cleanerUserId: string
  let cleanerProfileId: string
  let introductionId: string
  let stripeCustomerId: string
  let stripePaymentMethodId: string

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    const { data: existing } = await admin
      .from('users')
      .select('id')
      .in('email', [CUSTOMER_EMAIL, CLEANER_EMAIL])
    if (existing?.length) {
      await admin.from('users').delete().in('id', existing.map(u => u.id))
    }

    const stripeCustomer = await stripe.customers.create({ email: CUSTOMER_EMAIL })
    stripeCustomerId = stripeCustomer.id
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: stripeCustomerId })
    stripePaymentMethodId = pm.id

    const { data: customer, error: customerErr } = await admin
      .from('users')
      .insert({
        email: CUSTOMER_EMAIL,
        password_hash: DUMMY_PASSWORD_HASH,
        role: 'CUSTOMER',
        full_name: 'E2E Concurrency Customer',
        email_verified: true,
        stripe_customer_id: stripeCustomerId,
      })
      .select('id')
      .single()
    if (customerErr || !customer) throw new Error(`Failed to create test customer: ${customerErr?.message}`)
    customerId = customer.id

    const { data: cleanerUser, error: cleanerErr } = await admin
      .from('users')
      .insert({
        email: CLEANER_EMAIL,
        password_hash: DUMMY_PASSWORD_HASH,
        role: 'CLEANER',
        full_name: 'E2E Concurrency Cleaner',
        email_verified: true,
      })
      .select('id')
      .single()
    if (cleanerErr || !cleanerUser) throw new Error(`Failed to create test cleaner: ${cleanerErr?.message}`)
    cleanerUserId = cleanerUser.id

    const { data: cleanerProfile, error: profileErr } = await admin
      .from('cleaner_profiles')
      .insert({
        user_id: cleanerUserId,
        slug: 'e2e-concurrency-cleaner',
        display_name: 'E2E Concurrency Cleaner',
        city: 'Limassol',
        hourly_rate_eur: 20,
        services: ['HOUSE'],
        status: 'ACTIVE',
      })
      .select('id')
      .single()
    if (profileErr || !cleanerProfile) throw new Error(`Failed to create test cleaner profile: ${profileErr?.message}`)
    cleanerProfileId = cleanerProfile.id

    const { data: intro, error: introErr } = await admin
      .from('introductions')
      .insert({ customer_id: customerId, cleaner_profile_id: cleanerProfileId })
      .select('id')
      .single()
    if (introErr || !intro) throw new Error(`Failed to create test introduction: ${introErr?.message}`)
    introductionId = intro.id
  })

  afterAll(async () => {
    if (stripeCustomerId) {
      await stripe.customers.del(stripeCustomerId).catch(() => {})
    }
    if (customerId || cleanerUserId) {
      await admin.from('users').delete().in('id', [customerId, cleanerUserId].filter(Boolean))
    }
  })

  it('two simultaneous CONFIRM requests result in exactly one charge', async () => {
    const { POST: createBooking } = await import('../../app/api/bookings/route')
    const { PATCH: patchBooking } = await import('../../app/api/bookings/[id]/route')

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    sessionAs(customerId, 'CUSTOMER')
    const createRes = await createBooking(jsonRequest({
      introduction_id: introductionId,
      bedrooms: 1,
      bathrooms: 1,
      cleaning_type: 'STANDARD',
      date: tomorrow,
      start_time: '11:00',
      duration_hours: 3,
      address: '1 Race Condition Ave, Limassol',
      payment_method_id: stripePaymentMethodId,
    }) as never)
    expect(createRes.status).toBe(201)
    const booking = await createRes.json()
    const bookingId: string = booking.id

    // Fire both concurrently — this is the actual race, not a serial
    // "call twice" that would trivially pass regardless of the fix.
    sessionAs(cleanerUserId, 'CLEANER')
    const [resA, resB] = await Promise.all([
      patchBooking(jsonRequest({ action: 'CONFIRM' }) as never, { params: { id: bookingId } }),
      patchBooking(jsonRequest({ action: 'CONFIRM' }) as never, { params: { id: bookingId } }),
    ])
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()])
    const results = [{ status: resA.status, body: bodyA }, { status: resB.status, body: bodyB }]

    const succeeded = results.filter(r => r.status === 200)
    const rejected = results.filter(r => r.status !== 200)
    expect(succeeded.length, `expected exactly one 200, got: ${JSON.stringify(results)}`).toBe(1)
    expect(rejected.length).toBe(1)
    expect(succeeded[0].body.status).toBe('CONFIRMED')
    // The loser must be a clean rejection (stale-write 409 from the
    // status-guarded update), not a 5xx or a second successful charge.
    expect(rejected[0].status).toBe(409)

    const { data: payment } = await admin
      .from('payments')
      .select('status, amount_eur, provider_payment_intent_id')
      .eq('booking_id', bookingId)
      .single()
    expect(payment?.status).toBe('PAID')
    expect(payment?.provider_payment_intent_id).toBeTruthy()

    // The actual proof: exactly one succeeded PaymentIntent for this booking,
    // charged exactly once for the quoted amount — not twice.
    const paymentIntent = await stripe.paymentIntents.retrieve(payment!.provider_payment_intent_id!)
    expect(paymentIntent.status).toBe('succeeded')
    expect(paymentIntent.amount_received).toBe(6050) // 20 EUR/hr x 3h + BOOKING_FEE_EUR (0.5), charged once

    const { data: finalBooking } = await admin
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single()
    expect(finalBooking?.status).toBe('CONFIRMED')
  })
})
