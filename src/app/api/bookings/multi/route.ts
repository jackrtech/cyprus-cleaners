import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendNewBookingRequestEmail } from '@/lib/email'
import { BOOKING_FEE_EUR } from '@/lib/stripe'
import { isCleanerAvailableAt, type WeeklyAvailability } from '@/lib/availability'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const CLEANING_TYPES = ['STANDARD', 'DEEP', 'MOVE_IN_OUT']
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

type AdminClient = ReturnType<typeof createAdminClient>

// Same find-or-create logic as POST /api/introductions, called once per
// assigned cleaner instead of once — chat stays a normal 1:1 thread per
// cleaner, no group-chat concept.
async function findOrCreateIntroduction(supabase: AdminClient, customerId: string, cleanerProfileId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('introductions')
    .select('id')
    .eq('customer_id', customerId)
    .eq('cleaner_profile_id', cleanerProfileId)
    .maybeSingle()
  if (existing) return existing.id

  const { data, error } = await supabase
    .from('introductions')
    .insert({ customer_id: customerId, cleaner_profile_id: cleanerProfileId })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('introductions')
        .select('id')
        .eq('customer_id', customerId)
        .eq('cleaner_profile_id', cleanerProfileId)
        .single()
      if (raced) return raced.id
    }
    throw error
  }
  return data.id
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    cleaner_profile_ids: rawCleanerIds, bedrooms, bathrooms, cleaning_type, date, start_time,
    duration_hours, notes, address, address_lat, address_lng, finding_us_notes, payment_method_id,
  } = body

  const cleanerIds: string[] = Array.isArray(rawCleanerIds) ? rawCleanerIds : []
  if (cleanerIds.length < 2 || !cleanerIds.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'cleaner_profile_ids must be an array of at least 2 cleaner ids' }, { status: 400 })
  }
  if (new Set(cleanerIds).size !== cleanerIds.length) {
    return NextResponse.json({ error: 'cleaner_profile_ids must not contain duplicates' }, { status: 400 })
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

  interface CleanerProfileRow {
    id: string
    user_id: string | null
    services: string[] | null
    hourly_rate_eur: number | null
    availability: WeeklyAvailability | null
    status: string
    display_name: string
  }

  const { data: cleanerProfilesData, error: cpError } = await supabase
    .from('cleaner_profiles')
    .select('id, user_id, services, hourly_rate_eur, availability, status, display_name')
    .in('id', cleanerIds)
  const cleanerProfiles = cleanerProfilesData as unknown as CleanerProfileRow[] | null

  if (cpError || !cleanerProfiles || cleanerProfiles.length !== cleanerIds.length) {
    return NextResponse.json({ error: 'One or more selected cleaners could not be found' }, { status: 404 })
  }
  const inactive = cleanerProfiles.find(cp => cp.status !== 'ACTIVE' || !cp.hourly_rate_eur)
  if (inactive) {
    return NextResponse.json({ error: 'One or more selected cleaners are not currently bookable' }, { status: 409 })
  }

  // Availability — new for multi-cleaner bookings (no equivalent check
  // exists for single-cleaner bookings, a deliberate inconsistency, see
  // FLOWS.md §11). Server-side is the real authority; the form's own check
  // is just for immediate feedback.
  const unavailable = cleanerProfiles.filter(cp => !isCleanerAvailableAt(cp.availability as WeeklyAvailability | null, date, start_time, duration_hours))
  if (unavailable.length > 0) {
    return NextResponse.json({
      error: `Not available at this time: ${unavailable.map(cp => cp.display_name).join(', ')}`,
    }, { status: 409 })
  }

  // Resolve each cleaner's own rate for the job's tier — same
  // cleaner_service_offerings lookup as the single-cleaner route, just
  // required from every selected cleaner (the whole job shares one tier).
  let offeringsByCleanerId = new Map<string, number>()
  if (cleaning_type !== 'STANDARD') {
    const { data: offerings } = await supabase
      .from('cleaner_service_offerings')
      .select('cleaner_profile_id, price_eur')
      .in('cleaner_profile_id', cleanerIds)
      .eq('code', cleaning_type)
    const offeringRows = offerings as unknown as { cleaner_profile_id: string; price_eur: number }[] | null
    offeringsByCleanerId = new Map((offeringRows ?? []).map(o => [o.cleaner_profile_id, o.price_eur]))
    const missing = cleanerProfiles.filter(cp => !offeringsByCleanerId.has(cp.id))
    if (missing.length > 0) {
      return NextResponse.json({
        error: `This cleaning type isn't offered by: ${missing.map(cp => cp.display_name).join(', ')}`,
      }, { status: 409 })
    }
  }

  const rates = new Map<string, number>()
  for (const cp of cleanerProfiles) {
    rates.set(cp.id, cleaning_type === 'STANDARD' ? cp.hourly_rate_eur! : offeringsByCleanerId.get(cp.id)!)
  }

  // One 1:1 chat thread per assigned cleaner — reuses the exact same
  // find-or-create semantics as POST /api/introductions.
  const introductionByCleanerId = new Map<string, string>()
  try {
    for (const cp of cleanerProfiles) {
      introductionByCleanerId.set(cp.id, await findOrCreateIntroduction(supabase, session.user.id, cp.id))
    }
  } catch (introErr) {
    console.error('Multi-cleaner booking — introduction creation error:', introErr)
    return NextResponse.json({ error: 'Failed to start conversation with one or more cleaners' }, { status: 500 })
  }

  const service_type = cleanerProfiles[0]?.services?.[0] ?? 'HOUSE'

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      introduction_id:     null,
      customer_id:          session.user.id,
      cleaner_profile_id:   null,
      service_type,
      bedrooms,
      bathrooms,
      cleaning_type,
      addon_codes: [],  // add-ons aren't offered on multi-cleaner bookings yet — how an add-on's fee would attribute across cleaners is an open product decision
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
    console.error('Multi-cleaner booking insert error:', bookingError)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  const assignmentRows = cleanerProfiles.map(cp => ({
    booking_id:          booking.id,
    cleaner_profile_id:  cp.id,
    introduction_id:     introductionByCleanerId.get(cp.id)!,
    tier_rate_eur:       rates.get(cp.id)!,
    platform_fee_eur:    BOOKING_FEE_EUR,
  }))
  const { error: assignmentError } = await supabase.from('booking_assignments').insert(assignmentRows)
  if (assignmentError) {
    console.error('Multi-cleaner booking — assignment insert error:', assignmentError)
    await supabase.from('bookings').delete().eq('id', booking.id)
    return NextResponse.json({ error: 'Failed to save cleaner assignments for this booking' }, { status: 500 })
  }

  const cleanerPortionEur = cleanerProfiles.reduce((sum, cp) => sum + rates.get(cp.id)! * duration_hours, 0)
  const feeTotalEur = BOOKING_FEE_EUR * cleanerProfiles.length
  const { error: paymentError } = await supabase.from('payments').insert({
    booking_id: booking.id,
    amount_eur: Math.round((cleanerPortionEur + feeTotalEur) * 100) / 100,
    platform_fee_eur: Math.round(feeTotalEur * 100) / 100,
    status: 'PENDING',
    provider: 'stripe',
    provider_payment_method_id: payment_method_id,
  })
  if (paymentError) {
    console.error('Multi-cleaner booking — payment row insert error:', paymentError)
    await supabase.from('bookings').delete().eq('id', booking.id)
    return NextResponse.json({ error: 'Failed to save payment details for this booking' }, { status: 500 })
  }

  // System message + email per assigned cleaner's own thread — non-blocking
  try {
    await supabase.from('messages').insert(
      cleanerProfiles.map(cp => ({
        introduction_id: introductionByCleanerId.get(cp.id)!,
        sender_id:        session.user.id,
        booking_id:        booking.id,
        system_event:      'REQUESTED',
      }))
    )
  } catch (msgErr) {
    console.error('Multi-cleaner booking — system message insert error:', msgErr)
  }

  try {
    const cleanerUserIds = cleanerProfiles.map(cp => cp.user_id).filter((id): id is string => !!id)
    const { data: cleanerUsersData } = cleanerUserIds.length > 0
      ? await supabase.from('users').select('id, email, locale, full_name').in('id', cleanerUserIds)
      : { data: [] as { id: string; email: string; locale: 'en' | 'el'; full_name: string }[] }
    const cleanerUsers = cleanerUsersData as unknown as { id: string; email: string; locale: 'en' | 'el'; full_name: string }[] | null
    for (const cp of cleanerProfiles) {
      const cleanerUser = (cleanerUsers ?? []).find(u => u.id === cp.user_id)
      if (!cleanerUser?.email) continue
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
  } catch (emailErr) {
    console.error('Multi-cleaner booking — email send error:', emailErr)
  }

  return NextResponse.json(booking, { status: 201 })
}
