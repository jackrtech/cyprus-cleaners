import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendNewBookingRequestEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const CLEANING_TYPES = ['STANDARD', 'DEEP']
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
const SIGNED_URL_TTL = 60 * 60 // 1 hour

type AdminClient = ReturnType<typeof createAdminClient>

// Cleaners have RESPONSE_WINDOW_MS to confirm/decline a REQUESTED booking.
// There's no cron job in this app, so expiry is enforced lazily here: any
// REQUESTED row past its deadline is flipped to CANCELLED on the next read.
async function expireOverdueRequests<T extends { id: string; status: string; created_at: string }>(
  supabase: AdminClient,
  rows: T[]
): Promise<T[]> {
  const now = Date.now()
  const overdueIds = rows
    .filter(r => r.status === 'REQUESTED' && now - new Date(r.created_at).getTime() > RESPONSE_WINDOW_MS)
    .map(r => r.id)

  if (overdueIds.length === 0) return rows

  await supabase.from('bookings').update({ status: 'CANCELLED' }).in('id', overdueIds)

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
async function processBookingRows<T extends { id: string; status: string; created_at: string; photo_paths: string[] }>(
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
  const { introduction_id, bedrooms, bathrooms, cleaning_type, date, start_time, duration_hours, notes } = body

  if (!introduction_id || typeof introduction_id !== 'string') {
    return NextResponse.json({ error: 'introduction_id is required' }, { status: 400 })
  }
  if (typeof bedrooms !== 'number' || !Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 10) {
    return NextResponse.json({ error: 'bedrooms must be an integer between 0 and 10' }, { status: 400 })
  }
  if (typeof bathrooms !== 'number' || !Number.isInteger(bathrooms) || bathrooms < 1 || bathrooms > 10) {
    return NextResponse.json({ error: 'bathrooms must be an integer between 1 and 10' }, { status: 400 })
  }
  if (!CLEANING_TYPES.includes(cleaning_type)) {
    return NextResponse.json({ error: 'cleaning_type must be STANDARD or DEEP' }, { status: 400 })
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

  const supabase = createAdminClient()

  // The introduction must be APPROVED and belong to this customer
  const { data: intro, error: introError } = await supabase
    .from('introductions')
    .select('id, customer_id, cleaner_profile_id, status')
    .eq('id', introduction_id)
    .single()

  if (introError || !intro) {
    return NextResponse.json({ error: 'Introduction not found' }, { status: 404 })
  }
  if (intro.customer_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (intro.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Introduction must be approved before requesting a booking' }, { status: 409 })
  }

  // service_type is no longer a form field — derive it from what the cleaner offers
  const { data: cleanerProfile } = await supabase
    .from('cleaner_profiles')
    .select('services, user_id')
    .eq('id', intro.cleaner_profile_id)
    .single()

  const service_type = cleanerProfile?.services?.[0] ?? 'HOUSE'

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
      date,
      start_time,
      duration_hours,
      notes: notes?.trim() || null,
      status: 'REQUESTED',
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('Booking insert error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // Notify the cleaner — non-blocking, errors are swallowed
  try {
    if (cleanerProfile?.user_id) {
      const { data: cleanerUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', cleanerProfile.user_id)
        .single()

      if (cleanerUser?.email) {
        await sendNewBookingRequestEmail({
          cleanerEmail:  cleanerUser.email,
          cleanerLocale: null, // locale not stored in users table — defaults to EN
          customerName:  session.user.name ?? session.user.email,
          date,
          startTime:     start_time,
          durationHours: duration_hours,
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
        cleaner_profiles ( id, display_name, photo_url, cities ),
        reviews ( id )
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

    let query = supabase
      .from('bookings')
      .select(`
        *,
        users ( full_name )
      `)
      .eq('cleaner_profile_id', profile.id)

    if (introductionId) query = query.eq('introduction_id', introductionId)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('GET bookings (CLEANER) error:', error)
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
    }
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
