import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendNoShowFlaggedAdminAlertEmail,
  sendNoShowFlaggedConfirmationEmail,
  sendNoShowCorroborationRequestEmail,
  sendNoShowContestPromptEmail,
} from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const CLAIM_MAX_LENGTH = 2000
const FILING_WINDOW_MS = 24 * 60 * 60 * 1000
const RESOLUTION_SLA_MS = 24 * 60 * 60 * 1000

// Customer files a no-show against one specific assignee on a multi-cleaner
// booking. Mirrors POST /api/disputes' shape (same filing window, same 24h
// admin SLA) but is scoped to one booking_assignments row rather than the
// whole booking — see schema.sql's no_show_flags comment and FLOWS.md §11.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const assignment_id: string = typeof body.assignment_id === 'string' ? body.assignment_id : ''
  const claim: string = typeof body.claim === 'string' ? body.claim.trim() : ''

  if (!assignment_id) {
    return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 })
  }
  if (!claim) {
    return NextResponse.json({ error: 'A claim is required' }, { status: 400 })
  }
  if (claim.length > CLAIM_MAX_LENGTH) {
    return NextResponse.json({ error: `Claim must be ${CLAIM_MAX_LENGTH} characters or fewer` }, { status: 400 })
  }

  const supabase = createAdminClient()

  interface AssignmentRow {
    id: string
    booking_id: string
    cleaner_profile_id: string
    cleaner_profiles: { display_name: string; user_id: string | null } | { display_name: string; user_id: string | null }[] | null
    booking: { id: string; customer_id: string; status: string; completed_at: string | null } | { id: string; customer_id: string; status: string; completed_at: string | null }[] | null
  }
  function one<T>(x: T | T[] | null): T | null {
    return Array.isArray(x) ? x[0] ?? null : x
  }

  const { data: assignmentData, error: fetchError } = await supabase
    .from('booking_assignments')
    .select(`
      id, booking_id, cleaner_profile_id,
      cleaner_profiles ( display_name, user_id ),
      booking:bookings ( id, customer_id, status, completed_at )
    `)
    .eq('id', assignment_id)
    .single()

  if (fetchError || !assignmentData) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }
  const assignment = assignmentData as unknown as AssignmentRow
  const booking = one(assignment.booking)
  const flaggedCleanerProfile = one(assignment.cleaner_profiles)

  if (!booking || booking.customer_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Only a completed booking can be flagged' }, { status: 409 })
  }
  if (booking.completed_at && Date.now() - new Date(booking.completed_at).getTime() > FILING_WINDOW_MS) {
    return NextResponse.json({ error: 'The 24-hour window to report a no-show on this booking has passed' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('no_show_flags')
    .select('id')
    .eq('assignment_id', assignment_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A no-show has already been flagged for this cleaner on this booking' }, { status: 409 })
  }

  const { data: flag, error: insertError } = await supabase
    .from('no_show_flags')
    .insert({
      booking_id:  assignment.booking_id,
      assignment_id,
      flagged_by:  session.user.id,
      claim,
      resolve_by:  new Date(Date.now() + RESOLUTION_SLA_MS).toISOString(),
    })
    .select('*')
    .single()

  // The unique constraint on assignment_id is the real guard against a race
  // between two near-simultaneous filings — the pre-check above is just to
  // return a friendlier error in the common (non-racing) case.
  if (insertError?.code === '23505') {
    return NextResponse.json({ error: 'A no-show has already been flagged for this cleaner on this booking' }, { status: 409 })
  }
  if (insertError || !flag) {
    console.error('POST no-show-flags insert error:', insertError)
    return NextResponse.json({ error: 'Failed to file the no-show report' }, { status: 500 })
  }

  // Notify admin — non-blocking, errors swallowed
  try {
    await sendNoShowFlaggedAdminAlertEmail({
      bookingId:    assignment.booking_id,
      customerName: session.user.name ?? session.user.email,
      cleanerName:  flaggedCleanerProfile?.display_name ?? 'Unknown',
      claim,
      adminUrl:     `${BASE_URL}/admin/team-bookings`,
    })
  } catch (emailErr) {
    console.error('Email send error (no-show flagged admin alert):', emailErr)
  }

  // Confirm to the customer — non-blocking
  try {
    const { data: customerUser } = await supabase
      .from('users')
      .select('email, locale, full_name')
      .eq('id', session.user.id)
      .single()

    if (customerUser?.email) {
      await sendNoShowFlaggedConfirmationEmail({
        to:           customerUser.email,
        locale:       customerUser.locale,
        name:         customerUser.full_name,
        bookingDate:  (booking.completed_at ?? new Date().toISOString()).slice(0, 10),
        dashboardUrl: `${BASE_URL}/dashboard`,
      })
    }
  } catch (emailErr) {
    console.error('Email send error (no-show flagged confirmation):', emailErr)
  }

  // Prompt the flagged cleaner to contest — non-blocking
  try {
    if (flaggedCleanerProfile?.user_id) {
      const { data: flaggedUser } = await supabase
        .from('users')
        .select('email, locale, full_name')
        .eq('id', flaggedCleanerProfile.user_id)
        .single()

      if (flaggedUser?.email) {
        await sendNoShowContestPromptEmail({
          to:           flaggedUser.email,
          locale:       flaggedUser.locale,
          name:         flaggedUser.full_name,
          bookingDate:  (booking.completed_at ?? new Date().toISOString()).slice(0, 10),
          claim,
          dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
  } catch (emailErr) {
    console.error('Email send error (no-show contest prompt):', emailErr)
  }

  // Ask the other assignee(s) on this same job to corroborate — non-blocking
  try {
    const { data: otherAssignments } = await supabase
      .from('booking_assignments')
      .select('cleaner_profiles ( display_name, user_id )')
      .eq('booking_id', assignment.booking_id)
      .neq('id', assignment_id)

    for (const row of (otherAssignments ?? []) as { cleaner_profiles: { display_name: string; user_id: string | null } | { display_name: string; user_id: string | null }[] | null }[]) {
      const other = one(row.cleaner_profiles)
      if (!other?.user_id) continue
      const { data: otherUser } = await supabase
        .from('users')
        .select('email, locale, full_name')
        .eq('id', other.user_id)
        .single()
      if (!otherUser?.email) continue

      await sendNoShowCorroborationRequestEmail({
        to:                  otherUser.email,
        locale:              otherUser.locale,
        name:                otherUser.full_name,
        bookingDate:         (booking.completed_at ?? new Date().toISOString()).slice(0, 10),
        flaggedCleanerName:  flaggedCleanerProfile?.display_name ?? 'Unknown',
        dashboardUrl:        `${BASE_URL}/dashboard/cleaner`,
      })
    }
  } catch (emailErr) {
    console.error('Email send error (no-show corroboration request):', emailErr)
  }

  return NextResponse.json(flag, { status: 201 })
}
