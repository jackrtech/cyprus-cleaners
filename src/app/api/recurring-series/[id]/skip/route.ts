import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { computeNextOccurrenceDate } from '@/lib/recurringBookings'

// Skips this series' NEXT unhandled occurrence — always the next one, not
// an arbitrary future date, using the exact same computeNextOccurrenceDate
// the daily cron uses so the two can never disagree about which date that
// is. Only meaningful BEFORE that occurrence has been charged/created as a
// bookings row; once it exists (occurrence #1 always does, from the moment
// the series is created), skipping it is just the existing cancel action on
// that booking (PATCH /api/bookings/[id]) — see
// schema.sql's recurring_series_skips comment.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const reason: string | null = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null

  const supabase = createAdminClient()

  const { data: series, error: fetchError } = await supabase
    .from('recurring_series')
    .select('id, customer_id, cleaner_profile_id, anchor_date, status, cleaner_profiles ( user_id )')
    .eq('id', params.id)
    .single()

  if (fetchError || !series) {
    return NextResponse.json({ error: 'Recurring series not found' }, { status: 404 })
  }

  const cleanerProfile = Array.isArray(series.cleaner_profiles) ? series.cleaner_profiles[0] : series.cleaner_profiles
  const isCustomer = series.customer_id === session.user.id
  const isCleaner = cleanerProfile?.user_id === session.user.id
  if (!isCustomer && !isCleaner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (series.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'This recurring series is no longer active' }, { status: 409 })
  }

  const occurrenceDate = await computeNextOccurrenceDate(supabase, series.id, series.anchor_date)

  // If that date already exists as a real booking (already charged, or
  // occurrence #1 which always starts as an ordinary REQUESTED booking),
  // this is the wrong action — point at the normal cancel action instead.
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('recurring_series_id', series.id)
    .eq('date', occurrenceDate)
    .maybeSingle()
  if (existingBooking) {
    return NextResponse.json({ error: 'The next occurrence has already been booked — cancel it directly instead of skipping' }, { status: 409 })
  }

  const { data: skip, error: skipError } = await supabase
    .from('recurring_series_skips')
    .insert({
      recurring_series_id: series.id,
      occurrence_date: occurrenceDate,
      skipped_by: session.user.id,
      reason,
    })
    .select('*')
    .single()

  if (skipError?.code === '23505') {
    return NextResponse.json({ error: 'That occurrence has already been skipped' }, { status: 409 })
  }
  if (skipError || !skip) {
    console.error('POST recurring-series skip error:', skipError)
    return NextResponse.json({ error: 'Failed to skip this occurrence' }, { status: 500 })
  }

  return NextResponse.json(skip, { status: 201 })
}
