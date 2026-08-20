import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendNewBookingRequestEmail } from '@/lib/email'
import { BOOKING_FEE_EUR } from '@/lib/stripe'
import { ADDON_CODES, isAddonCode } from '@/lib/serviceOfferings'
import { isCleanerAvailableAt, type WeeklyAvailability } from '@/lib/availability'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const CLEANING_TYPES = ['STANDARD', 'DEEP', 'MOVE_IN_OUT']
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// Creates a recurring_series row plus its first occurrence (an ordinary
// bookings row, stamped recurring_series_id) — the first occurrence goes
// through the exact same REQUESTED -> cleaner confirms -> charged flow as
// any one-off booking (PATCH /api/bookings/[id], unchanged). Only once
// that first occurrence is CONFIRMED does the daily cron
// (/api/cron/charge-recurring) start spawning and auto-charging later
// occurrences — see that route and schema.sql's recurring_series comment.
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

  const { data: cleanerProfile } = await supabase
    .from('cleaner_profiles')
    .select('services, user_id, hourly_rate_eur, availability')
    .eq('id', intro.cleaner_profile_id)
    .single()

  const service_type = cleanerProfile?.services?.[0] ?? 'HOUSE'

  if (!cleanerProfile?.hourly_rate_eur) {
    return NextResponse.json({ error: 'This cleaner has no rate set — cannot create a booking' }, { status: 409 })
  }

  // day_of_week matches JS Date.getDay() directly (0=Sun..6=Sat) so it's
  // comparable against occurrence dates with no name/index translation
  // anywhere it's read — see schema.sql's recurring_series comment.
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()

  if (!isCleanerAvailableAt(cleanerProfile.availability as WeeklyAvailability | null, date, start_time, duration_hours)) {
    return NextResponse.json({ error: "This cleaner isn't available at that day/time according to their stated hours" }, { status: 409 })
  }

  // Recurring-only slot block (see the plan's own scoping decision — one-off
  // bookings are NOT checked against each other here, only against other
  // active recurring series): reject if this cleaner already has an ACTIVE
  // series on the same weekday with an overlapping time window.
  const requestedStartMin = Number(start_time.slice(0, 2)) * 60 + Number(start_time.slice(3, 5))
  const requestedEndMin = requestedStartMin + duration_hours * 60
  const { data: existingSeries } = await supabase
    .from('recurring_series')
    .select('id, start_time, duration_hours')
    .eq('cleaner_profile_id', intro.cleaner_profile_id)
    .eq('day_of_week', dayOfWeek)
    .eq('status', 'ACTIVE')

  const hasConflict = (existingSeries ?? []).some((s: { start_time: string; duration_hours: number }) => {
    const sStart = Number(String(s.start_time).slice(0, 2)) * 60 + Number(String(s.start_time).slice(3, 5))
    const sEnd = sStart + Number(s.duration_hours) * 60
    return requestedStartMin < sEnd && sStart < requestedEndMin
  })
  if (hasConflict) {
    return NextResponse.json({ error: 'This cleaner already has a recurring booking at that day and time' }, { status: 409 })
  }

  // Resolve pricing against this cleaner's actual opt-in tiers/add-ons —
  // same authority/reasoning as POST /api/bookings — then SNAPSHOT it onto
  // the series itself (see schema.sql's recurring_series comment for why
  // this deliberately never re-resolves per occurrence).
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

  const cleanerPortionEur = Math.round(tierRateEur * duration_hours * 100) / 100
  const amountEur = Math.round((cleanerPortionEur + addonTotalEur + BOOKING_FEE_EUR) * 100) / 100

  const { data: series, error: seriesError } = await supabase
    .from('recurring_series')
    .insert({
      customer_id:         session.user.id,
      cleaner_profile_id:  intro.cleaner_profile_id,
      introduction_id,
      cleaning_type,
      addon_codes,
      bedrooms,
      bathrooms,
      duration_hours,
      address:             address.trim(),
      address_lat:         hasLat ? address_lat : null,
      address_lng:         hasLat ? address_lng : null,
      finding_us_notes:    finding_us_notes?.trim() || null,
      day_of_week:         dayOfWeek,
      start_time,
      anchor_date:         date,
      payment_method_id,
      tier_rate_eur:       tierRateEur,
      platform_fee_eur:    BOOKING_FEE_EUR,
      addon_total_eur:     addonTotalEur,
      amount_eur:          amountEur,
    })
    .select('*')
    .single()

  if (seriesError || !series) {
    console.error('Recurring series insert error:', seriesError)
    return NextResponse.json({ error: 'Failed to create recurring series' }, { status: 500 })
  }

  // Occurrence #1 — an entirely ordinary booking, just stamped with
  // recurring_series_id. Everything downstream (cleaner confirm/decline,
  // off-session charge, chat, cancellation, disputes, payout) is the
  // existing single-cleaner code path, completely unchanged.
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      introduction_id,
      customer_id:         session.user.id,
      cleaner_profile_id:  intro.cleaner_profile_id,
      recurring_series_id: series.id,
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

  if (bookingError || !booking) {
    console.error('Recurring first-occurrence booking insert error:', bookingError)
    await supabase.from('recurring_series').delete().eq('id', series.id)
    return NextResponse.json({ error: 'Failed to create the first occurrence' }, { status: 500 })
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    booking_id: booking.id,
    amount_eur: amountEur,
    platform_fee_eur: BOOKING_FEE_EUR,
    tier_rate_eur: tierRateEur,
    addon_total_eur: addonTotalEur,
    status: 'PENDING',
    provider: 'stripe',
    provider_payment_method_id: payment_method_id,
  })
  if (paymentError) {
    console.error('Recurring first-occurrence payment insert error:', paymentError)
    await supabase.from('bookings').delete().eq('id', booking.id)
    await supabase.from('recurring_series').delete().eq('id', series.id)
    return NextResponse.json({ error: 'Failed to save payment details for this booking' }, { status: 500 })
  }

  try {
    await supabase.from('messages').insert({
      introduction_id,
      sender_id:    session.user.id,
      booking_id:   booking.id,
      system_event: 'REQUESTED',
    })
  } catch (msgErr) {
    console.error('System message insert error (recurring booking requested):', msgErr)
  }

  try {
    if (cleanerProfile.user_id) {
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
    console.error('Email send error (new recurring booking request):', emailErr)
  }

  return NextResponse.json({ series, booking }, { status: 201 })
}
