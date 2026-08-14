// Seeds realistic data covering every booking/dispute/verification UI state,
// hung entirely off the three real controlled accounts — never creates new
// users, never touches their passwords/roles/profile data. Fully idempotent:
// wipes and recreates everything scoped to the Jack<->Sasha thread and
// Sasha's addresses each run, so it's safe to re-run any time.
//
// Usage:
//   node src/scripts/seed-full.js
//   node src/scripts/seed-full.js --verification=pending
//   node src/scripts/seed-full.js --verification=rejected
//   node src/scripts/seed-full.js --verification=approved

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')

const JACK_EMAIL  = 'jackrowsell@gmail.com'
const SASHA_EMAIL = 'sashanizkaya@gmail.com'
const ADMIN_EMAIL = 'admin@gmail.com'

const DAY_MS = 24 * 60 * 60 * 1000

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

function isoIn(msFromNow) {
  return new Date(Date.now() + msFromNow).toISOString()
}

function dateStrIn(daysFromNow) {
  return new Date(Date.now() + daysFromNow * DAY_MS).toISOString().slice(0, 10)
}

async function main() {
  loadEnvLocal()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env.local.')
    process.exit(1)
  }

  const verificationFlag = process.argv.find(a => a.startsWith('--verification='))?.split('=')[1] ?? null
  if (verificationFlag && !['pending', 'rejected', 'approved'].includes(verificationFlag)) {
    console.error('--verification must be pending, rejected, or approved')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ─── Look up the three real accounts — never create them ──────────────────
  const { data: jack } = await supabase.from('users').select('id, full_name').eq('email', JACK_EMAIL).single()
  const { data: sasha } = await supabase.from('users').select('id, full_name').eq('email', SASHA_EMAIL).single()
  const { data: admin } = await supabase.from('users').select('id').eq('email', ADMIN_EMAIL).single()

  if (!jack) { console.error(`No user found for ${JACK_EMAIL} — this script never creates users, add the real account first.`); process.exit(1) }
  if (!sasha) { console.error(`No user found for ${SASHA_EMAIL} — this script never creates users, add the real account first.`); process.exit(1) }
  if (!admin) { console.warn(`Warning: no user found for ${ADMIN_EMAIL} — continuing without it (nothing seeded needs it directly).`) }

  const { data: jackProfile } = await supabase.from('cleaner_profiles').select('id, hourly_rate_eur, services').eq('user_id', jack.id).single()
  if (!jackProfile) { console.error(`${JACK_EMAIL} has no cleaner_profiles row — cannot seed bookings.`); process.exit(1) }

  const rate = Number(jackProfile.hourly_rate_eur) || 15
  const serviceType = jackProfile.services?.[0] ?? 'HOUSE'

  // ─── Find-or-create the one thread between them ────────────────────────────
  let { data: intro } = await supabase
    .from('introductions')
    .select('id')
    .eq('customer_id', sasha.id)
    .eq('cleaner_profile_id', jackProfile.id)
    .maybeSingle()

  if (!intro) {
    const { data: newIntro, error } = await supabase
      .from('introductions')
      .insert({ customer_id: sasha.id, cleaner_profile_id: jackProfile.id })
      .select('id')
      .single()
    if (error) { console.error('Failed to create introduction thread:', error.message); process.exit(1) }
    intro = newIntro
  }

  // ─── Wipe everything scoped to this thread + Sasha's addresses ────────────
  console.log('Clearing previously seeded data...')
  const { data: existingBookings } = await supabase.from('bookings').select('id').eq('introduction_id', intro.id)
  const existingBookingIds = (existingBookings ?? []).map(b => b.id)

  await supabase.from('messages').delete().eq('introduction_id', intro.id)
  if (existingBookingIds.length > 0) {
    await supabase.from('disputes').delete().in('booking_id', existingBookingIds)
    await supabase.from('reviews').delete().in('booking_id', existingBookingIds)
    await supabase.from('payments').delete().in('booking_id', existingBookingIds)
    await supabase.from('bookings').delete().in('id', existingBookingIds)
  }
  await supabase.from('addresses').delete().eq('user_id', sasha.id)

  // ─── Addresses ──────────────────────────────────────────────────────────
  console.log('Seeding addresses...')
  const { data: addresses, error: addrError } = await supabase
    .from('addresses')
    .insert([
      { user_id: sasha.id, label: 'Home', line1: 'Agias Elenis 12', city: 'Larnaca', lat: 34.9009, lng: 33.6368 },
      { user_id: sasha.id, label: "Mum's house", line1: 'Pervolia village', area: 'Pervolia', city: 'Larnaca', lat: 34.8574, lng: 33.5873 },
      { user_id: sasha.id, label: 'Office', line1: 'Makariou Ave 45', city: 'Nicosia', lat: 35.1667, lng: 33.3667 },
    ])
    .select('id, label, line1, city, area, lat, lng')
  if (addrError) { console.error('Failed to seed addresses:', addrError.message); process.exit(1) }
  const homeAddress = addresses.find(a => a.label === 'Home')

  function addressFields(a) {
    return {
      address: a.area ? `${a.line1}, ${a.area}, ${a.city}` : `${a.line1}, ${a.city}`,
      address_lat: a.lat,
      address_lng: a.lng,
    }
  }

  // ─── Bookings ───────────────────────────────────────────────────────────
  console.log('Seeding bookings...')
  const baseBooking = {
    introduction_id: intro.id,
    customer_id: sasha.id,
    cleaner_profile_id: jackProfile.id,
    service_type: serviceType,
    bedrooms: 2,
    bathrooms: 1,
    cleaning_type: 'STANDARD',
    duration_hours: 3,
    ...addressFields(homeAddress),
  }
  const amount = Math.round(rate * 3 * 100) / 100

  const bookingSpecs = [
    { key: 'requested_fresh',       status: 'REQUESTED', created_at: isoIn(-2 * 60 * 60 * 1000), date: dateStrIn(3), start_time: '10:00', payment: 'PENDING' },
    { key: 'requested_expiring',    status: 'REQUESTED', created_at: isoIn(-23.5 * 60 * 60 * 1000), date: dateStrIn(4), start_time: '11:00', payment: 'PENDING' },
    { key: 'confirmed_future',      status: 'CONFIRMED', created_at: isoIn(-1 * DAY_MS), date: dateStrIn(3), start_time: '09:00', payment: 'PAID' },
    { key: 'confirmed_today',       status: 'CONFIRMED', created_at: isoIn(-2 * DAY_MS), date: dateStrIn(0), start_time: '14:00', payment: 'PAID' },
    { key: 'confirmed_cancellable', status: 'CONFIRMED', created_at: isoIn(-2 * DAY_MS), date: dateStrIn(5), start_time: '10:00', payment: 'PAID' },
    { key: 'confirmed_noncancellable', status: 'CONFIRMED', created_at: isoIn(-2 * DAY_MS), date: dateStrIn(0), start_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(11, 16), payment: 'PAID' },
    { key: 'completed_no_review',   status: 'COMPLETED', created_at: isoIn(-5 * DAY_MS), date: dateStrIn(-2), start_time: '10:00', payment: 'PAID', completed_at: isoIn(-2 * DAY_MS), photos: 4 },
    { key: 'completed_reviewed',    status: 'COMPLETED', created_at: isoIn(-6 * DAY_MS), date: dateStrIn(-3), start_time: '10:00', payment: 'PAID', completed_at: isoIn(-3 * DAY_MS), photos: 4 },
    { key: 'completed_window_expired', status: 'COMPLETED', created_at: isoIn(-13 * DAY_MS), date: dateStrIn(-10), start_time: '10:00', payment: 'PAID', completed_at: isoIn(-10 * DAY_MS), photos: 4 },
    { key: 'cancelled_customer_refunded', status: 'CANCELLED', created_at: isoIn(-4 * DAY_MS), date: dateStrIn(4), start_time: '10:00', payment: 'REFUNDED', cancelled_by: sasha.id, cancellation_reason: 'Change of plans' },
    { key: 'cancelled_cleaner_norefund', status: 'CANCELLED', created_at: isoIn(-1 * DAY_MS), date: dateStrIn(0), start_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(11, 16), payment: 'PAID', cancelled_by: jack.id, cancellation_reason: 'Unable to attend' },
    { key: 'cancelled_system_expiry', status: 'CANCELLED', created_at: isoIn(-25 * 60 * 60 * 1000), date: dateStrIn(2), start_time: '10:00', payment: 'PENDING', cancelled_by: null, cancellation_reason: null },
    { key: 'cancelled_refund_failed', status: 'CANCELLED', created_at: isoIn(-3 * DAY_MS), date: dateStrIn(3), start_time: '10:00', payment: 'REFUND_FAILED', cancelled_by: sasha.id, cancellation_reason: 'Customer requested cancellation' },
  ]

  const bookings = {}
  for (const spec of bookingSpecs) {
    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        ...baseBooking,
        status: spec.status,
        date: spec.date,
        start_time: spec.start_time,
        created_at: spec.created_at,
        completed_at: spec.completed_at ?? null,
        cancelled_by: spec.cancelled_by ?? null,
        cancellation_reason: spec.cancellation_reason ?? null,
        photo_paths: spec.photos ? Array.from({ length: spec.photos }, (_, i) => `${jackProfile.id}/seed-${spec.key}-${i}.jpg`) : [],
      })
      .select('id')
      .single()
    if (error) { console.error(`Failed to seed booking ${spec.key}:`, error.message); process.exit(1) }
    bookings[spec.key] = booking.id

    await supabase.from('payments').insert({
      booking_id: booking.id,
      amount_eur: amount,
      status: spec.payment,
      provider: 'stripe',
      provider_payment_intent_id: spec.payment === 'PENDING' ? null : `pi_seed_${spec.key}`,
      provider_payment_method_id: `pm_seed_${spec.key}`,
      paid_at: spec.payment === 'PENDING' ? null : spec.created_at,
      refunded_at: spec.payment === 'REFUNDED' ? isoIn(-1 * DAY_MS) : null,
    })
  }

  // ─── Extra completed bookings, one per seeded dispute ──────────────────────
  console.log('Seeding dispute-hosting bookings and disputes...')
  const disputeSpecs = [
    { key: 'dispute_open_no_response', filed: -1, resolveBy: 4, status: 'OPEN', claim: 'The bathroom was not cleaned properly, tiles still dirty' },
    { key: 'dispute_open_responded',   filed: -2, resolveBy: 3, status: 'OPEN', claim: 'Some surfaces were left dusty and the kitchen floor was still sticky', response: 'I cleaned everything thoroughly, I have photos as proof' },
    { key: 'dispute_resolved_customer', filed: -6, resolveBy: -1, status: 'RESOLVED', resolution: 'CUSTOMER', refund: 100, claim: 'Cleaner left without finishing the second bedroom', adminNote: 'Photos confirmed the second bedroom was untouched.' },
    { key: 'dispute_resolved_cleaner', filed: -6, resolveBy: -1, status: 'RESOLVED', resolution: 'CLEANER', refund: 0, claim: 'Claimed items were missing after the clean', adminNote: 'No evidence supporting the claim; completion photos show the property as described.' },
    { key: 'dispute_resolved_unresolvable', filed: -6, resolveBy: -1, status: 'RESOLVED', resolution: 'UNRESOLVABLE', refund: 50, claim: "Says the job wasn't up to standard, cleaner disputes this", adminNote: "Couldn't determine fault with confidence from the evidence available." },
    { key: 'dispute_overdue', filed: -6, resolveBy: -1, status: 'OPEN', claim: 'Property was left in a worse state than before, still awaiting review' },
  ]

  const reviewTexts = [
    { rating: 5, body: 'Maria was absolutely fantastic, left everything spotless. Will book again!' },
    { rating: 4, body: 'Great service, very thorough. A little late but did an excellent job.' },
    { rating: 3, body: 'Decent clean but missed the oven. Pointed it out and sorted it quickly.' },
    { rating: 4, body: 'Very professional, arrived on time, good communication.' },
    { rating: 5, body: 'Best cleaner I have used in Cyprus. Highly recommend!' },
  ]

  for (let i = 0; i < disputeSpecs.length; i++) {
    const spec = disputeSpecs[i]
    const completedAt = isoIn(spec.filed * DAY_MS - 60 * 60 * 1000)

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        ...baseBooking,
        status: 'COMPLETED',
        date: dateStrIn(spec.filed - 1),
        start_time: '10:00',
        created_at: isoIn(spec.filed * DAY_MS - 2 * DAY_MS),
        completed_at: completedAt,
        photo_paths: Array.from({ length: 4 }, (_, p) => `${jackProfile.id}/seed-${spec.key}-${p}.jpg`),
      })
      .select('id')
      .single()
    if (error) { console.error(`Failed to seed dispute-hosting booking ${spec.key}:`, error.message); process.exit(1) }

    await supabase.from('payments').insert({
      booking_id: booking.id,
      amount_eur: amount,
      status: spec.status === 'RESOLVED' && spec.resolution !== 'CLEANER' ? 'REFUNDED' : 'PAID',
      provider: 'stripe',
      provider_payment_intent_id: `pi_seed_${spec.key}`,
      provider_payment_method_id: `pm_seed_${spec.key}`,
      paid_at: completedAt,
      refunded_at: spec.status === 'RESOLVED' && spec.resolution !== 'CLEANER' ? isoIn(spec.resolveBy * DAY_MS) : null,
    })

    const { error: disputeError } = await supabase.from('disputes').insert({
      booking_id: booking.id,
      customer_id: sasha.id,
      cleaner_profile_id: jackProfile.id,
      claim: spec.claim,
      cleaner_response: spec.response ?? null,
      status: spec.status,
      resolution: spec.resolution ?? null,
      refund_percentage: spec.refund ?? 0,
      admin_note: spec.adminNote ?? null,
      created_at: isoIn(spec.filed * DAY_MS),
      resolve_by: isoIn(spec.resolveBy * DAY_MS),
      resolved_at: spec.status === 'RESOLVED' ? isoIn(spec.resolveBy * DAY_MS) : null,
    })
    if (disputeError) { console.error(`Failed to seed dispute ${spec.key}:`, disputeError.message); process.exit(1) }

    // Attach one of the 5 review texts to 4 of the 6 dispute-hosting bookings
    // (a booking can carry both a review and a dispute — they're independent)
    if (i < reviewTexts.length - 1) {
      await supabase.from('reviews').insert({
        booking_id: booking.id,
        customer_id: sasha.id,
        cleaner_profile_id: jackProfile.id,
        rating: reviewTexts[i].rating,
        body: reviewTexts[i].body,
        is_mock: true,
      })
    }
  }

  // The 5th review text goes on the dedicated "completed_reviewed" booking
  await supabase.from('reviews').insert({
    booking_id: bookings.completed_reviewed,
    customer_id: sasha.id,
    cleaner_profile_id: jackProfile.id,
    rating: reviewTexts[reviewTexts.length - 1].rating,
    body: reviewTexts[reviewTexts.length - 1].body,
    is_mock: true,
  })

  // ─── Chat messages ──────────────────────────────────────────────────────
  console.log('Seeding chat messages...')
  await supabase.from('messages').insert([
    { introduction_id: intro.id, sender_id: sasha.id, body: 'Hi Jack, I need a deep clean of my 2 bedroom apartment in Larnaca', created_at: isoIn(-2 * 60 * 60 * 1000 - 5 * 60 * 1000) },
    { introduction_id: intro.id, sender_id: jack.id, body: 'Hello! Happy to help, I am available that day. Just confirming the details now.', created_at: isoIn(-2 * 60 * 60 * 1000 - 2 * 60 * 1000) },
    { introduction_id: intro.id, sender_id: sasha.id, booking_id: bookings.requested_fresh, system_event: 'REQUESTED', created_at: isoIn(-2 * 60 * 60 * 1000) },
    { introduction_id: intro.id, sender_id: sasha.id, body: 'Hi, quick question — do you bring your own cleaning products?', created_at: isoIn(-1 * DAY_MS + 5 * 60 * 1000) },
    { introduction_id: intro.id, sender_id: jack.id, body: 'Yes I bring everything, no need to prepare anything on your side!', created_at: isoIn(-1 * DAY_MS + 10 * 60 * 1000) },
    { introduction_id: intro.id, sender_id: sasha.id, body: 'Perfect, thank you', created_at: isoIn(-1 * DAY_MS + 12 * 60 * 1000) },
    { introduction_id: intro.id, sender_id: jack.id, booking_id: bookings.confirmed_future, system_event: 'CONFIRMED', created_at: isoIn(-1 * DAY_MS + 15 * 60 * 1000) },
  ])

  // ─── Jack's verification state (only touched if --verification was passed) ─
  if (verificationFlag) {
    console.log(`Setting Jack's verification state to ${verificationFlag}...`)
    const updates = {
      pending:  { verification_status: 'PENDING', id_submitted_at: new Date().toISOString(), verification_note: null, id_photo_url: `${jackProfile.id}/id-document`, selfie_photo_url: `${jackProfile.id}/selfie` },
      rejected: { verification_status: 'REJECTED', id_submitted_at: null, verification_note: 'ID photo is blurry. Please resubmit with a clearer image.', verified: false },
      approved: { verification_status: 'APPROVED', verified: true, verification_note: null },
    }
    await supabase.from('cleaner_profiles').update(updates[verificationFlag]).eq('id', jackProfile.id)
  }

  console.log('')
  console.log(`Seeded ${bookingSpecs.length + disputeSpecs.length} bookings, ${disputeSpecs.length} disputes, ${addresses.length} addresses, 5 reviews, 7 chat messages.`)
  console.log('Log in as sashanizkaya@gmail.com or jackrowsell@gmail.com to see it.')
}

main().catch(err => {
  console.error('Seed error:', err)
  process.exit(1)
})
