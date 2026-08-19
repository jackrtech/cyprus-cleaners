import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendNewBookingRequestEmail } from '@/lib/email'
import { BOOKING_FEE_EUR } from '@/lib/stripe'
import { ADDON_CODES, isAddonCode } from '@/lib/serviceOfferings'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const CLEANING_TYPES = ['STANDARD', 'DEEP', 'MOVE_IN_OUT']
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
const SIGNED_URL_TTL = 60 * 60 // 1 hour

type AdminClient = ReturnType<typeof createAdminClient>

// Cleaners have RESPONSE_WINDOW_MS to confirm/decline a REQUESTED booking.
// There's no cron job in this app, so expiry is enforced lazily here: any
// REQUESTED row past its deadline is flipped to CANCELLED on the next read.
async function expireOverdueRequests<T extends { id: string; introduction_id: string; customer_id: string; status: string; created_at: string }>(
  supabase: AdminClient,
  rows: T[]
): Promise<T[]> {
  const now = Date.now()
  const overdue = rows.filter(r => r.status === 'REQUESTED' && now - new Date(r.created_at).getTime() > RESPONSE_WINDOW_MS)

  if (overdue.length === 0) return rows

  const overdueIds = overdue.map(r => r.id)
  await supabase.from('bookings').update({ status: 'CANCELLED' }).in('id', overdueIds)

  // System message per expired booking — no acting user for an automatic
  // expiry, so the customer (a valid party in the thread) is the sender;
  // rendering doesn't attribute system messages to anyone anyway. Non-blocking:
  // a message-insert hiccup shouldn't fail the whole bookings list fetch.
  try {
    await supabase.from('messages').insert(
      overdue.map(r => ({
        introduction_id: r.introduction_id,
        sender_id:       r.customer_id,
        booking_id:      r.id,
        system_event:    'CANCELLED',
      }))
    )
  } catch (msgErr) {
    console.error('System message insert error (booking auto-expired):', msgErr)
  }

  return rows.map(r => overdueIds.includes(r.id) ? { ...r, status: 'CANCELLED' } : r)
}

// booking-photos is a private bucket — display URLs are signed and regenerated
// on every fetch rather than stored, so the underlying photos never need to
// "expire" even though any individual link is only valid for SIGNED_URL_TTL.
async function signPhotoUrls<T extends { id: string; photo_paths: string[] }>(
  supabase: AdminClient,
  rows: T[]
): Promise<(T & { photo_urls: string[] })[]> {
  const allPaths = rows.flatMap(r => r.photo_paths ?? [])
  if (allPaths.length === 0) return rows.map(r => ({ ...r, photo_urls: [] }))

  const { data: signed } = await supabase.storage
    .from('booking-photos')
    .createSignedUrls(allPaths, SIGNED_URL_TTL)

  const urlByPath = new Map((signed ?? []).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]))

  return rows.map(r => ({
    ...r,
    photo_urls: (r.photo_paths ?? [])
      .map(p => urlByPath.get(p))
      .filter((u): u is string => !!u),
  }))
}

// Combines the two post-fetch steps above into a single call so TypeScript
// can infer the row shape once instead of losing it across a chained call.
async function processBookingRows<T extends { id: string; introduction_id: string; customer_id: string; status: string; created_at: string; photo_paths: string[] }>(
  supabase: AdminClient,
  rows: T[]
) {
  const expired = await expireOverdueRequests(supabase, rows)
  return signPhotoUrls(supabase, expired)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { introduction_id, bedrooms, bathrooms, cleaning_type, date, start_time, duration_hours, notes, address, address_lat, address_lng, finding_us_notes, payment_method_id, addon_codes: rawAddonCodes } = body

  const addon_codes: string[] = Array.isArray(rawAddonCodes) ? rawAddonCodes : []
  if (!addon_codes.every((c): c is string => typeof c === 'string' && isAddonCode(c))) {
    return NextResponse.json({ error: `addon_codes must only contain ${ADDON_CODES.join(', ')}` }, { status: 400 })
  }
  if (new Set(addon_codes).size !== addon_codes.length) {
    return NextResponse.json({ error: 'addon_codes must not contain duplicates' }, { status: 400 })
  }

  if (!introduction_id || typeof introduction_id !== 'string') {
    return NextResponse.json({ error: 'introduction_id is required' }, { status: 400 })
  }
  if (!payment_method_id || typeof payment_method_id !== 'string') {
    return NextResponse.json({ error: 'A saved payment method is required' }, { status: 400 })
  }
  if (typeof bedrooms !== 'number' || !Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 10) {
    return NextResponse.json({ error: 'bedrooms must be an integer between 0 and 10' }, { status: 400 })
  }
  if (typeof bathrooms !== 'number' || !Number.isInteger(bathrooms) || bathrooms < 1 || bathrooms > 10) {
    return NextResponse.json({ error: 'bathrooms must be an integer between 1 and 10' }, { status: 400 })
  }
  if (!CLEANING_TYPES.includes(cleaning_type)) {
    return NextResponse.json({ error: `cleaning_type must be one of ${CLEANING_TYPES.join(', ')}` }, { status: 400 })
  }
  if (typeof date !== 'string' || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })
  }
  if (typeof start_time !== 'string' || !TIME_RE.test(start_time)) {
    return NextResponse.json({ error: 'start_time must be in HH:MM format' }, { status: 400 })
  }
  if (new Date(`${date}T${start_time}:00`).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That date and time is in the past' }, { status: 400 })
  }
  if (typeof duration_hours !== 'number' || duration_hours < 1 || duration_hours > 12) {
    return NextResponse.json({ error: 'duration_hours must be between 1 and 12' }, { status: 400 })
  }
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 1000)) {
    return NextResponse.json({ error: 'Notes must be 1000 characters or fewer' }, { status: 400 })
  }
  if (typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ error: 'A property address is required' }, { status: 400 })
  }
  if (address.trim().length > 200) {
    return NextResponse.json({ error: 'Address must be 200 characters or fewer' }, { status: 400 })
  }
  if (finding_us_notes !== undefined && finding_us_notes !== null && (typeof finding_us_notes !== 'string' || finding_us_notes.length > 500)) {
    return NextResponse.json({ error: 'Finding-us notes must be 500 characters or fewer' }, { status: 400 })
  }
  const hasLat = address_lat !== undefined && address_lat !== null
  const hasLng = address_lng !== undefined && address_lng !== null
  if (hasLat !== hasLng) {
    return NextResponse.json({ error: 'A map pin needs both a latitude and a longitude' }, { status: 400 })
  }
  if (hasLat && (typeof address_lat !== 'number' || address_lat < -90 || address_lat > 90 || typeof address_lng !== 'number' || address_lng < -180 || address_lng > 180)) {
    return NextResponse.json({ error: 'Invalid map pin coordinates' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // The introduction thread must exist and belong to this customer
  const { data: intro, error: introError } = await supabase
    .from('introductions')
    .select('id, customer_id, cleaner_profile_id')
    .eq('id', introduction_id)
    .single()

  if (introError || !intro) {
    return NextResponse.json({ error: 'Introduction not found' }, { status: 404 })
  }
  if (intro.customer_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // service_type is no longer a form field — derive it from what the cleaner offers
  const { data: cleanerProfile } = await supabase
    .from('cleaner_profiles')
    .select('services, user_id, hourly_rate_eur')
    .eq('id', intro.cleaner_profile_id)
    .single()

  const service_type = cleanerProfile?.services?.[0] ?? 'HOUSE'

  if (!cleanerProfile?.hourly_rate_eur) {
    return NextResponse.json({ error: 'This cleaner has no rate set — cannot create a booking' }, { status: 409 })
  }

  // Resolve pricing against this cleaner's actual opt-in tiers/add-ons — the
  // booking form already filters to what a cleaner offers, but this is the
  // real authority (a stale client, or a request bypassing the form
  // entirely, must never be able to book a tier/add-on the cleaner hasn't
  // enabled). Only fetch the rows relevant to this booking.
  const relevantCodes = [...(cleaning_type !== 'STANDARD' ? [cleaning_type] : []), ...addon_codes]
  let offerings: { code: string; price_eur: number }[] = []
  if (relevantCodes.length > 0) {
    const { data: offeringRows } = await supabase
      .from('cleaner_service_offerings')
      .select('code, price_eur')
      .eq('cleaner_profile_id', intro.cleaner_profile_id)
      .in('code', relevantCodes)
    offerings = offeringRows ?? []
  }

  let tierRateEur: number
  if (cleaning_type === 'STANDARD') {
    tierRateEur = cleanerProfile.hourly_rate_eur
  } else {
    const tierOffering = offerings.find(o => o.code === cleaning_type)
    if (!tierOffering) {
      return NextResponse.json({ error: 'This cleaner does not offer that cleaning type' }, { status: 409 })
    }
    tierRateEur = tierOffering.price_eur
  }

  let addonTotalEur = 0
  for (const code of addon_codes) {
    const addonOffering = offerings.find(o => o.code === code)
    if (!addonOffering) {
      return NextResponse.json({ error: `This cleaner does not offer the ${code} add-on` }, { status: 409 })
    }
    addonTotalEur += addonOffering.price_eur
  }
  addonTotalEur = Math.round(addonTotalEur * 100) / 100

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      introduction_id,
      customer_id:        session.user.id,
      cleaner_profile_id: intro.cleaner_profile_id,
      service_type,
      bedrooms,
      bathrooms,
      cleaning_type,
      addon_codes,
      date,
      start_time,
      duration_hours,
      notes: notes?.trim() || null,
      address: address.trim(),
      address_lat: hasLat ? address_lat : null,
      address_lng: hasLat ? address_lng : null,
      finding_us_notes: finding_us_notes?.trim() || null,
      status: 'REQUESTED',
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('Booking insert error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // Payment isn't charged yet (that happens when the cleaner confirms — see
  // /api/bookings/[id] CONFIRM) — this just records the saved card against
  // the booking so the amount is locked in at the rate (and fee) quoted now.
  // amount_eur is the TOTAL the customer pays — cleaner's tier rate × hours,
  // plus any add-ons, plus the flat platform fee. tier_rate_eur/
  // addon_total_eur/platform_fee_eur are all stored per-payment (see
  // schema.sql's payments table comment) so a cleaner's later price changes
  // never rewrite a past booking's breakdown — cleaner_payout_eur is left
  // null until the payout-release job determines the final figure (see
  // src/lib/payouts.ts).
  const cleanerPortionEur = Math.round(tierRateEur * duration_hours * 100) / 100
  const { error: paymentError } = await supabase.from('payments').insert({
    booking_id: data.id,
    amount_eur: Math.round((cleanerPortionEur + addonTotalEur + BOOKING_FEE_EUR) * 100) / 100,
    platform_fee_eur: BOOKING_FEE_EUR,
    tier_rate_eur: tierRateEur,
    addon_total_eur: addonTotalEur,
    status: 'PENDING',
    provider: 'stripe',
    provider_payment_method_id: payment_method_id,
  })
  if (paymentError) {
    console.error('Payment row insert error:', paymentError)
    await supabase.from('bookings').delete().eq('id', data.id)
    return NextResponse.json({ error: 'Failed to save payment details for this booking' }, { status: 500 })
  }

  // System message announcing the request in the chat thread — non-blocking,
  // errors swallowed so a message-insert hiccup never fails the booking itself
  try {
    await supabase.from('messages').insert({
      introduction_id,
      sender_id:    session.user.id,
      booking_id:   data.id,
      system_event: 'REQUESTED',
    })
  } catch (msgErr) {
    console.error('System message insert error (booking requested):', msgErr)
  }

  // Notify the cleaner — non-blocking, errors are swallowed
  try {
    if (cleanerProfile?.user_id) {
      const { data: cleanerUser } = await supabase
        .from('users')
        .select('email, locale, full_name')
        .eq('id', cleanerProfile.user_id)
        .single()

      if (cleanerUser?.email) {
        await sendNewBookingRequestEmail({
          cleanerEmail:  cleanerUser.email,
          cleanerLocale: cleanerUser.locale,
          cleanerName:   cleanerUser.full_name,
          customerName:  session.user.name ?? session.user.email,
          date,
          startTime:     start_time,
          durationHours: duration_hours,
          address:       address.trim(),
          dashboardUrl:  `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
  } catch (emailErr) {
    console.error('Email send error (new booking request):', emailErr)
  }

  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { role, id: userId } = session.user
  const introductionId = req.nextUrl.searchParams.get('introduction_id')

  if (role === 'CUSTOMER') {
    let query = supabase
      .from('bookings')
      .select(`
        *,
        cleaner_profiles ( id, slug, display_name, photo_url, cities ),
        reviews ( id ),
        disputes ( id, status ),
        payments ( amount_eur, platform_fee_eur, status )
      `)
      .eq('customer_id', userId)

    if (introductionId) query = query.eq('introduction_id', introductionId)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('GET bookings (CUSTOMER) error:', error)
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
    }
    return NextResponse.json(await processBookingRows(supabase, data))
  }

  if (role === 'CLEANER') {
    const { data: profile } = await supabase
      .from('cleaner_profiles')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!profile) {
      return NextResponse.json([])
    }

    const bookingSelect = `
      *,
      users!bookings_customer_id_fkey ( full_name ),
      payments ( amount_eur, platform_fee_eur, cleaner_payout_eur, status, payout_status, payout_release_at ),
      booking_assignments ( cleaner_profile_id, tier_rate_eur, platform_fee_eur, payout_status, cleaner_payout_eur, no_show )
    `

    // Bookings assigned directly to this cleaner (the ordinary, single-cleaner
    // case — cleaner_profile_id is set).
    let singleQuery = supabase.from('bookings').select(bookingSelect).eq('cleaner_profile_id', profile.id)
    if (introductionId) singleQuery = singleQuery.eq('introduction_id', introductionId)

    // Multi-cleaner bookings this cleaner is one of the assignees on —
    // cleaner_profile_id is null there, so they only show up via
    // booking_assignments (see schema.sql).
    let assignmentQuery = supabase.from('booking_assignments').select('booking_id').eq('cleaner_profile_id', profile.id)
    if (introductionId) assignmentQuery = assignmentQuery.eq('introduction_id', introductionId)
    const { data: myAssignments } = await assignmentQuery
    const multiBookingIds = (myAssignments ?? []).map((a: { booking_id: string }) => a.booking_id)

    const [singleResult, multiResult] = await Promise.all([
      singleQuery.order('created_at', { ascending: false }),
      multiBookingIds.length > 0
        ? supabase.from('bookings').select(bookingSelect).in('id', multiBookingIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (singleResult.error || multiResult.error) {
      console.error('GET bookings (CLEANER) error:', singleResult.error || multiResult.error)
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
    }

    const data = [...(singleResult.data ?? []), ...(multiResult.data ?? [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(await processBookingRows(supabase, data))
  }

  // ADMIN: return everything
  let query = supabase.from('bookings').select('*')
  if (introductionId) query = query.eq('introduction_id', introductionId)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('GET bookings (ADMIN) error:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
  return NextResponse.json(await processBookingRows(supabase, data))
}
