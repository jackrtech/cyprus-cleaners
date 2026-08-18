// End-to-end "money path" — proves the full booking/payment loop actually
// works against the live Supabase project and a real Stripe TEST-mode charge,
// not mocks. One re-runnable script, not a full suite: signup-equivalent →
// book → cleaner confirms (real off-session charge) → complete → review.
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

// Mocked: email delivery isn't part of the money path and would otherwise
// send real messages via Resend on every run. Everything else (DB, Stripe) is real.
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

const CUSTOMER_EMAIL = 'e2e-moneypath-customer@example.com'
const CLEANER_EMAIL = 'e2e-moneypath-cleaner@example.com'
const DUMMY_PASSWORD_HASH = '$2b$12$K3q8h5x2u1S9v0z7y6w5x.OeQyq8h5x2u1S9v0z7y6w5xOeQyq8h5x'

describe.skipIf(!hasLiveCreds || !isTestStripeKey)('Money path (live DB + Stripe test mode)', () => {
  let admin: SupabaseClient
  let stripe: Stripe
  let customerId: string
  let cleanerUserId: string
  let cleanerProfileId: string
  let introductionId: string
  let bookingId: string
  let stripeCustomerId: string
  let stripePaymentMethodId: string

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    // Clean slate: delete any leftovers from a previous run (cascades
    // cleaner_profiles/introductions/bookings/payments/reviews via FK).
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .in('email', [CUSTOMER_EMAIL, CLEANER_EMAIL])
    if (existing?.length) {
      await admin.from('users').delete().in('id', existing.map(u => u.id))
    }

    // Real Stripe test customer + a Stripe-documented test PaymentMethod
    // token, attached directly (server-side) to simulate a card already
    // saved from a prior SetupIntent — this is the standard way to test an
    // off-session charge without driving a browser through Stripe Elements.
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
        full_name: 'E2E Money Path Customer',
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
        full_name: 'E2E Money Path Cleaner',
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
        slug: 'e2e-moneypath-cleaner',
        display_name: 'E2E Money Path Cleaner',
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

  it('runs the full loop: request -> confirm (real charge) -> complete -> review', async () => {
    const { POST: createBooking } = await import('../../app/api/bookings/route')
    const { PATCH: patchBooking } = await import('../../app/api/bookings/[id]/route')
    const { POST: createReview } = await import('../../app/api/reviews/route')

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 1. Customer requests a booking
    sessionAs(customerId, 'CUSTOMER')
    const createRes = await createBooking(jsonRequest({
      introduction_id: introductionId,
      bedrooms: 2,
      bathrooms: 1,
      cleaning_type: 'STANDARD',
      date: tomorrow,
      start_time: '10:00',
      duration_hours: 2,
      address: '1 Test Street, Limassol',
      payment_method_id: stripePaymentMethodId,
    }) as never)
    expect(createRes.status).toBe(201)
    const booking = await createRes.json()
    expect(booking.status).toBe('REQUESTED')
    bookingId = booking.id

    const { data: pendingPayment } = await admin
      .from('payments')
      .select('status, amount_eur')
      .eq('booking_id', bookingId)
      .single()
    expect(pendingPayment?.status).toBe('PENDING')
    expect(pendingPayment?.amount_eur).toBe(41) // 20 EUR/hr x 2h + BOOKING_FEE_EUR

    // 2. Cleaner confirms -> real off-session Stripe charge in test mode
    sessionAs(cleanerUserId, 'CLEANER')
    const confirmRes = await patchBooking(
      jsonRequest({ action: 'CONFIRM' }) as never,
      { params: { id: bookingId } }
    )
    const confirmBody = await confirmRes.json()
    expect(confirmRes.status, `CONFIRM failed: ${JSON.stringify(confirmBody)}`).toBe(200)
    expect(confirmBody.status).toBe('CONFIRMED')

    const { data: paidPayment } = await admin
      .from('payments')
      .select('status, provider_payment_intent_id')
      .eq('booking_id', bookingId)
      .single()
    expect(paidPayment?.status).toBe('PAID')
    expect(paidPayment?.provider_payment_intent_id).toBeTruthy()

    const paymentIntent = await stripe.paymentIntents.retrieve(paidPayment!.provider_payment_intent_id!)
    expect(paymentIntent.status).toBe('succeeded')
    expect(paymentIntent.amount).toBe(4100)

    // 3. Satisfy COMPLETE's preconditions (date reached, >=4 photos) directly —
    // photo upload UX isn't part of the money path being verified here.
    await admin.from('bookings').update({
      date: new Date().toISOString().slice(0, 10),
      photo_paths: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'],
    }).eq('id', bookingId)

    const { data: statsBefore } = await admin
      .from('cleaner_profiles')
      .select('total_jobs_count')
      .eq('id', cleanerProfileId)
      .single()

    const completeRes = await patchBooking(
      jsonRequest({ action: 'COMPLETE' }) as never,
      { params: { id: bookingId } }
    )
    const completeBody = await completeRes.json()
    expect(completeRes.status, `COMPLETE failed: ${JSON.stringify(completeBody)}`).toBe(200)
    expect(completeBody.status).toBe('COMPLETED')

    // Confirms the on_booking_status_change DB trigger actually fired.
    const { data: statsAfter } = await admin
      .from('cleaner_profiles')
      .select('total_jobs_count')
      .eq('id', cleanerProfileId)
      .single()
    expect(statsAfter?.total_jobs_count).toBe((statsBefore?.total_jobs_count ?? 0) + 1)

    // 4. Customer reviews the completed booking
    sessionAs(customerId, 'CUSTOMER')
    const reviewRes = await createReview(jsonRequest({
      booking_id: bookingId,
      rating: 5,
      body: 'E2E money-path test review',
    }) as never)
    expect(reviewRes.status).toBe(201)

    // Confirms the on_review_insert DB trigger actually fired.
    const { data: finalStats } = await admin
      .from('cleaner_profiles')
      .select('review_count, avg_rating')
      .eq('id', cleanerProfileId)
      .single()
    expect(finalStats?.review_count).toBe(1)
    expect(finalStats?.avg_rating).toBe(5)

    // 5. Payout: fee split is recorded, and the payout is correctly NOT
    // released yet — the booking just completed, nowhere near the 24h hold.
    const { data: paymentAfterComplete } = await admin
      .from('payments')
      .select('platform_fee_eur, cleaner_payout_eur, payout_status')
      .eq('booking_id', bookingId)
      .single()
    expect(paymentAfterComplete?.platform_fee_eur).toBe(1)
    expect(paymentAfterComplete?.cleaner_payout_eur).toBeNull()
    expect(paymentAfterComplete?.payout_status).toBe('PENDING')

    const { releaseDuePayouts } = await import('../../lib/payouts')
    const processed = await releaseDuePayouts(admin as never)
    expect(processed).toBeGreaterThanOrEqual(1) // this booking was scanned...

    const { data: paymentAfterRelease } = await admin
      .from('payments')
      .select('payout_status')
      .eq('booking_id', bookingId)
      .single()
    expect(paymentAfterRelease?.payout_status).toBe('PENDING') // ...but still held, correctly
  })
})
