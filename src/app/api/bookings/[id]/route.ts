import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBookingConfirmedEmail, sendBookingCompletedEmail, sendBookingDeclinedEmail, sendBookingCancelledEmail, sendRefundFailedAlertEmail, sendBookingConfirmedAdminAlertEmail } from '@/lib/email'
import Stripe from 'stripe'
import { getStripe, PAYOUT_HOLD_MS } from '@/lib/stripe'
import { checkAndAwardCleansMilestones } from '@/lib/badges'

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

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, introduction_id, customer_id, cleaner_profile_id, status, date, start_time, duration_hours, created_at, photo_paths')
    .eq('id', params.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // A multi-cleaner booking has cleaner_profile_id/introduction_id null —
  // its cleaners live in booking_assignments instead (see schema.sql). Every
  // single-cleaner booking (the only kind that exists in the app today)
  // takes the branch below unchanged.
  interface Assignment {
    id: string
    cleaner_profile_id: string
    introduction_id: string
    cleaner_profiles: { user_id: string; display_name: string } | null
  }
  let assignments: Assignment[] | null = null
  if (!booking.cleaner_profile_id) {
    const { data } = await supabase
      .from('booking_assignments')
      .select('id, cleaner_profile_id, introduction_id, cleaner_profiles ( user_id, display_name )')
      .eq('booking_id', booking.id)
    assignments = data as unknown as Assignment[] | null
  }

  const { data: cleanerProfile } = booking.cleaner_profile_id
    ? await supabase
        .from('cleaner_profiles')
        .select('user_id, display_name')
        .eq('id', booking.cleaner_profile_id)
        .single()
    : { data: null }

  const myAssignment = assignments?.find(a => a.cleaner_profiles?.user_id === session.user.id) ?? null

  const isCustomer = booking.customer_id === session.user.id
  const isCleaner  = cleanerProfile?.user_id === session.user.id || !!myAssignment

  if (!isCustomer && !isCleaner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Single display name for single-cleaner bookings, a joined list for
  // multi-cleaner ones — used everywhere a notification names "the cleaner".
  const cleanerDisplayName = cleanerProfile?.display_name
    ?? (assignments ?? []).map(a => a.cleaner_profiles?.display_name).filter(Boolean).join(', ')
    ?? ''

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
        const stripe = getStripe()
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
  if (newStatus === 'COMPLETED') {
    update.completed_at = new Date().toISOString()
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

  // Stamp an informational "held until" on the payment row — the actual
  // release decision is re-derived live by src/lib/payouts.ts (an open
  // dispute extends the real hold well past this), this is just what the
  // cleaner's earnings view shows before that job has run.
  if (newStatus === 'COMPLETED') {
    await supabase.from('payments').update({
      payout_release_at: new Date(Date.now() + PAYOUT_HOLD_MS).toISOString(),
    }).eq('booking_id', booking.id)

    // Cleans-milestone badges -- reads total_jobs_count fresh, so this runs
    // after the update above so the on_booking_completed DB trigger (which
    // bumps that count) has already fired. Single-cleaner and every
    // multi-cleaner assignee, each checked against their own count.
    const cleanerIdsToCheck = booking.cleaner_profile_id
      ? [booking.cleaner_profile_id]
      : (assignments ?? []).map(a => a.cleaner_profile_id)
    for (const id of cleanerIdsToCheck) {
      await checkAndAwardCleansMilestones(supabase, id)
    }
  }

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
          const stripe = getStripe()
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
    // Single-cleaner booking: one thread, one message. Multi-cleaner: post
    // the same event into every assigned cleaner's own 1:1 thread.
    const introductionIds = booking.introduction_id
      ? [booking.introduction_id]
      : (assignments ?? []).map(a => a.introduction_id)
    await supabase.from('messages').insert(
      introductionIds.map(introduction_id => ({
        introduction_id,
        sender_id:    session.user.id,
        booking_id:   booking.id,
        system_event: systemEvent,
      }))
    )
  } catch (msgErr) {
    console.error(`System message insert error (booking ${action.toLowerCase()}):`, msgErr)
  }

  // Notify the customer on confirm/complete — non-blocking, errors are swallowed
  if (newStatus === 'CONFIRMED' || newStatus === 'COMPLETED') {
    try {
      const { data: customerUser } = await supabase
        .from('users')
        .select('email, full_name, locale')
        .eq('id', booking.customer_id)
        .single()

      if (customerUser?.email) {
        if (newStatus === 'CONFIRMED') {
          const { data: paidPayment } = await supabase
            .from('payments')
            .select('amount_eur')
            .eq('booking_id', booking.id)
            .single()

          await sendBookingConfirmedEmail({
            customerEmail:  customerUser.email,
            customerLocale: customerUser.locale,
            customerName:   customerUser.full_name ?? customerUser.email,
            cleanerName:    cleanerDisplayName,
            date:           booking.date,
            startTime:      booking.start_time,
            durationHours:  data.duration_hours,
            amountEur:      paidPayment?.amount_eur ?? 0,
            dashboardUrl:   `${BASE_URL}/dashboard`,
          })

          await sendBookingConfirmedAdminAlertEmail({
            bookingId:    booking.id,
            customerName: customerUser.full_name ?? customerUser.email,
            cleanerName:  cleanerDisplayName,
            amountEur:    paidPayment?.amount_eur ?? 0,
            date:         booking.date,
            startTime:    booking.start_time,
            adminUrl:     `${BASE_URL}/admin/cancellations`,
          })
        } else {
          await sendBookingCompletedEmail({
            customerEmail:  customerUser.email,
            customerLocale: customerUser.locale,
            customerName:   customerUser.full_name ?? customerUser.email,
            cleanerName:    cleanerDisplayName,
            dashboardUrl:   `${BASE_URL}/dashboard`,
          })
        }
      }
    } catch (emailErr) {
      console.error(`Email send error (booking ${newStatus.toLowerCase()}):`, emailErr)
    }
  }

  // Notify the customer on decline — non-blocking, errors are swallowed
  if (action === 'DECLINE') {
    try {
      const { data: customerUser } = await supabase
        .from('users')
        .select('email, locale, full_name')
        .eq('id', booking.customer_id)
        .single()

      if (customerUser?.email) {
        await sendBookingDeclinedEmail({
          customerEmail:  customerUser.email,
          customerLocale: customerUser.locale,
          customerName:   customerUser.full_name ?? customerUser.email,
          cleanerName:    cleanerDisplayName,
          date:           booking.date,
          startTime:      booking.start_time,
          dashboardUrl:   `${BASE_URL}/dashboard`,
        })
      }
    } catch (emailErr) {
      console.error('Email send error (booking declined):', emailErr)
    }
  }

  // Notify whichever party didn't act on cancel — non-blocking, errors swallowed
  if (action === 'CANCEL') {
    try {
      if (isCustomer) {
        // Single-cleaner booking → one recipient; multi-cleaner → every assigned cleaner
        const cleanerUserIds = cleanerProfile?.user_id
          ? [cleanerProfile.user_id]
          : (assignments ?? []).map(a => (a.cleaner_profiles as { user_id: string } | null)?.user_id).filter((id): id is string => !!id)

        const { data: cleanerUsers } = cleanerUserIds.length > 0
          ? await supabase.from('users').select('email, locale, full_name').in('id', cleanerUserIds)
          : { data: [] }

        for (const cleanerUser of cleanerUsers ?? []) {
          if (!cleanerUser.email) continue
          await sendBookingCancelledEmail({
            to:              cleanerUser.email,
            locale:          cleanerUser.locale,
            name:            cleanerUser.full_name ?? cleanerUser.email,
            cancelledByRole: 'CUSTOMER',
            date:            booking.date,
            startTime:       booking.start_time,
            reason:          reason || null,
            dashboardUrl:    `${BASE_URL}/dashboard/cleaner`,
          })
        }
      } else if (isCleaner) {
        const { data: customerUser } = await supabase
          .from('users')
          .select('email, locale, full_name')
          .eq('id', booking.customer_id)
          .single()

        if (customerUser?.email) {
          await sendBookingCancelledEmail({
            to:              customerUser.email,
            locale:          customerUser.locale,
            name:            customerUser.full_name ?? customerUser.email,
            cancelledByRole: 'CLEANER',
            date:            booking.date,
            startTime:       booking.start_time,
            reason:          reason || null,
            dashboardUrl:    `${BASE_URL}/dashboard`,
          })
        }
      }
    } catch (emailErr) {
      console.error('Email send error (booking cancelled):', emailErr)
    }
  }

  return NextResponse.json(data)
}
