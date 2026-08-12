import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBookingConfirmedEmail, sendBookingCompletedEmail, sendRefundFailedAlertEmail } from '@/lib/email'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const VALID_ACTIONS = ['CONFIRM', 'DECLINE', 'CANCEL', 'COMPLETE'] as const
type Action = typeof VALID_ACTIONS[number]
const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
const MIN_COMPLETION_PHOTOS = 4
const CANCELLATION_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000

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
  const stripe = getStripe()

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
    case 'CONFIRM': {
      if (!isCleaner) return NextResponse.json({ error: 'Only the cleaner can confirm a booking' }, { status: 403 })
      if (booking.status !== 'REQUESTED') {
        return NextResponse.json({ error: 'Only a requested booking can be confirmed' }, { status: 409 })
      }

      // Charge the customer's saved card now — they aren't present for this
      // step (the cleaner is the one confirming), so this has to be an
      // off-session charge against the payment method saved at request time.
      const { data: payment, error: paymentFetchError } = await supabase
        .from('payments')
        .select('id, amount_eur, status, provider_payment_method_id')
        .eq('booking_id', booking.id)
        .single()

      if (paymentFetchError || !payment || !payment.provider_payment_method_id) {
        return NextResponse.json({ error: 'No payment method on file for this booking' }, { status: 409 })
      }
      if (payment.status !== 'PENDING') {
        return NextResponse.json({ error: `This booking's payment is already ${payment.status.toLowerCase()}` }, { status: 409 })
      }

      const { data: customerUser } = await supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', booking.customer_id)
        .single()

      if (!customerUser?.stripe_customer_id) {
        return NextResponse.json({ error: 'No payment account on file for this customer' }, { status: 409 })
      }

      try {
        // Idempotency key scoped to this booking — if two concurrent Confirm
        // requests both reach Stripe, only the first actually charges; the
        // second gets back the same PaymentIntent instead of a new charge.
        const paymentIntent = await stripe.paymentIntents.create({
          amount:   Math.round(payment.amount_eur * 100),
          currency: 'eur',
          customer: customerUser.stripe_customer_id,
          payment_method: payment.provider_payment_method_id,
          off_session: true,
          confirm: true,
        }, {
          idempotencyKey: `confirm-${booking.id}`,
        })

        if (paymentIntent.status !== 'succeeded') {
          throw new Error(`Unexpected PaymentIntent status: ${paymentIntent.status}`)
        }

        await supabase.from('payments').update({
          status: 'PAID',
          provider_payment_intent_id: paymentIntent.id,
          paid_at: new Date().toISOString(),
        }).eq('id', payment.id)
      } catch (chargeErr) {
        console.error('Booking confirm — charge failed:', chargeErr)
        await supabase.from('payments').update({ status: 'FAILED' }).eq('id', payment.id)
        const message = chargeErr instanceof Stripe.errors.StripeError
          ? chargeErr.message
          : 'Payment failed — please ask the customer to update their payment method'
        return NextResponse.json({ error: message }, { status: 402 })
      }

      newStatus = 'CONFIRMED'
      break
    }

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

  // Guard the write on the status we validated against above — closes the
  // check-then-act race where two concurrent requests (e.g. a double-tap on
  // Confirm, or a Confirm and a Decline landing together) both pass their
  // individual status check before either write lands. Whichever request's
  // update loses the race affects zero rows instead of clobbering the other.
  const { data: updateRows, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', params.id)
    .eq('status', booking.status)
    .select('*')

  if (error) {
    console.error('Booking update error:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
  if (!updateRows || updateRows.length === 0) {
    return NextResponse.json({ error: 'This booking was just updated by another request — refresh and try again' }, { status: 409 })
  }
  const data = updateRows[0]

  // Refund on cancellation — only relevant for CANCEL (DECLINE only ever
  // applies to a REQUESTED booking, which was never charged). Full refund
  // if cancelled 24h+ before the booking's start time, none inside that
  // window — the whole point of charging at confirm-time is to discourage
  // last-minute cancellations.
  if (action === 'CANCEL') {
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status, amount_eur, provider_payment_intent_id')
      .eq('booking_id', booking.id)
      .single()

    if (payment?.status === 'PAID' && payment.provider_payment_intent_id) {
      const bookingStartMs = new Date(`${booking.date}T${booking.start_time}`).getTime()
      const isEligible = bookingStartMs - Date.now() >= CANCELLATION_REFUND_WINDOW_MS

      if (isEligible) {
        try {
          await stripe.refunds.create({
            payment_intent: payment.provider_payment_intent_id,
          }, {
            idempotencyKey: `refund-${booking.id}`,
          })
          await supabase.from('payments').update({
            status: 'REFUNDED',
            refunded_at: new Date().toISOString(),
          }).eq('id', payment.id)
        } catch (refundErr) {
          // The booking is still cancelled either way — a failed refund
          // shouldn't block that — but the customer is now owed money nobody
          // has sent them. Record that plainly and alert an admin instead of
          // just logging it, so it doesn't get lost.
          console.error('Booking cancel — refund failed:', refundErr)
          await supabase.from('payments').update({ status: 'REFUND_FAILED' }).eq('id', payment.id)
          try {
            const { data: customerUser } = await supabase
              .from('users')
              .select('full_name, email')
              .eq('id', booking.customer_id)
              .single()
            if (customerUser) {
              await sendRefundFailedAlertEmail({
                bookingId:     booking.id,
                customerName:  customerUser.full_name,
                customerEmail: customerUser.email,
                amountEur:     payment.amount_eur,
                stripeError:   refundErr instanceof Stripe.errors.StripeError ? refundErr.message : 'Unknown error',
                adminUrl:      `${BASE_URL}/admin/cancellations`,
              })
            }
          } catch (alertErr) {
            console.error('Refund-failed admin alert error:', alertErr)
          }
        }
      }
    }
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
