import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBookingConfirmedEmail, sendBookingCompletedEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const VALID_ACTIONS = ['CONFIRM', 'DECLINE', 'CANCEL', 'COMPLETE'] as const
type Action = typeof VALID_ACTIONS[number]
const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
const MIN_COMPLETION_PHOTOS = 4

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const action: Action = body.action
  const reason: string | undefined = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, introduction_id, customer_id, cleaner_profile_id, status, date, start_time, duration_hours, created_at, photo_paths')
    .eq('id', params.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data: cleanerProfile } = await supabase
    .from('cleaner_profiles')
    .select('user_id, display_name')
    .eq('id', booking.cleaner_profile_id)
    .single()

  const isCustomer = booking.customer_id === session.user.id
  const isCleaner  = cleanerProfile?.user_id === session.user.id

  if (!isCustomer && !isCleaner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isOverdue = booking.status === 'REQUESTED'
    && Date.now() - new Date(booking.created_at).getTime() > RESPONSE_WINDOW_MS

  if (isOverdue && (action === 'CONFIRM' || action === 'DECLINE')) {
    await supabase.from('bookings').update({ status: 'CANCELLED' }).eq('id', params.id)
    return NextResponse.json({ error: 'This request has expired — the 24h response window has passed' }, { status: 409 })
  }

  let newStatus: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

  switch (action) {
    case 'CONFIRM':
      if (!isCleaner) return NextResponse.json({ error: 'Only the cleaner can confirm a booking' }, { status: 403 })
      if (booking.status !== 'REQUESTED') {
        return NextResponse.json({ error: 'Only a requested booking can be confirmed' }, { status: 409 })
      }
      newStatus = 'CONFIRMED'
      break

    case 'DECLINE':
      if (!isCleaner) return NextResponse.json({ error: 'Only the cleaner can decline a booking' }, { status: 403 })
      if (booking.status !== 'REQUESTED') {
        return NextResponse.json({ error: 'Only a requested booking can be declined' }, { status: 409 })
      }
      newStatus = 'CANCELLED'
      break

    case 'CANCEL':
      if (booking.status !== 'REQUESTED' && booking.status !== 'CONFIRMED') {
        return NextResponse.json({ error: 'Only a requested or confirmed booking can be cancelled' }, { status: 409 })
      }
      newStatus = 'CANCELLED'
      break

    case 'COMPLETE':
      if (!isCleaner) return NextResponse.json({ error: 'Only the cleaner can mark a booking complete' }, { status: 403 })
      if (booking.status !== 'CONFIRMED') {
        return NextResponse.json({ error: 'Only a confirmed booking can be marked complete' }, { status: 409 })
      }
      if (booking.date > new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: 'A booking cannot be marked complete before its scheduled date' }, { status: 409 })
      }
      if (booking.photo_paths.length < MIN_COMPLETION_PHOTOS) {
        return NextResponse.json(
          { error: `At least ${MIN_COMPLETION_PHOTOS} photos are required before marking this complete` },
          { status: 409 }
        )
      }
      newStatus = 'COMPLETED'
      break
  }

  // Note: review_prompted_at and cleaner_profiles stats are stamped by the
  // on_booking_status_change DB trigger when status transitions to COMPLETED —
  // never set them from application code.
  const update: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'CANCELLED') {
    update.cancellation_reason = reason || null
    update.cancelled_by = session.user.id
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error || !data) {
    console.error('Booking update error:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }

  // System message announcing the event in the chat thread — derived from the
  // action taken, not just the resulting status, since DECLINE and CANCEL
  // both resolve to CANCELLED but should read differently in chat.
  try {
    const systemEvent = action === 'CONFIRM' ? 'CONFIRMED'
      : action === 'DECLINE' ? 'DECLINED'
      : action === 'CANCEL'  ? 'CANCELLED'
      : 'COMPLETED'
    await supabase.from('messages').insert({
      introduction_id: booking.introduction_id,
      sender_id:       session.user.id,
      booking_id:      booking.id,
      system_event:    systemEvent,
    })
  } catch (msgErr) {
    console.error(`System message insert error (booking ${action.toLowerCase()}):`, msgErr)
  }

  // Notify the customer on confirm/complete — non-blocking, errors are swallowed
  if (newStatus === 'CONFIRMED' || newStatus === 'COMPLETED') {
    try {
      const { data: customerUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', booking.customer_id)
        .single()

      if (customerUser?.email) {
        if (newStatus === 'CONFIRMED') {
          await sendBookingConfirmedEmail({
            customerEmail:  customerUser.email,
            customerLocale: null, // locale not stored in users table — defaults to EN
            cleanerName:    cleanerProfile?.display_name ?? '',
            date:           booking.date,
            startTime:      booking.start_time,
            durationHours:  data.duration_hours,
            dashboardUrl:   `${BASE_URL}/dashboard`,
          })
        } else {
          await sendBookingCompletedEmail({
            customerEmail:  customerUser.email,
            customerLocale: null, // locale not stored in users table — defaults to EN
            cleanerName:    cleanerProfile?.display_name ?? '',
            dashboardUrl:   `${BASE_URL}/dashboard`,
          })
        }
      }
    } catch (emailErr) {
      console.error(`Email send error (booking ${newStatus.toLowerCase()}):`, emailErr)
    }
  }

  return NextResponse.json(data)
}
