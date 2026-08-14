import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { sendRefundFailedAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// A resolved dispute doesn't automatically refund anyone — see FLOWS.md §7:
// "no refund or compensation logic is tied to a dispute ruling." This is the
// deliberate manual action an admin takes after ruling for a customer.
// { id } is the dispute id.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const stripe = getStripe()

  const { data: dispute, error: fetchError } = await supabase
    .from('disputes')
    .select('id, booking_id, status')
    .eq('id', params.id)
    .single()

  if (fetchError || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
  }
  if (dispute.status !== 'RESOLVED') {
    return NextResponse.json({ error: 'Resolve this dispute before issuing a refund' }, { status: 409 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id')
    .eq('id', dispute.booking_id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, amount_eur, provider_payment_intent_id')
    .eq('booking_id', booking.id)
    .single()

  // PAID (fresh refund) or REFUND_FAILED (retrying via this surface instead
  // of the cancellations ledger) are both "customer hasn't been refunded
  // yet" — anything else (REFUNDED, FAILED, PENDING) has nothing to refund.
  if (!payment || !payment.provider_payment_intent_id || (payment.status !== 'PAID' && payment.status !== 'REFUND_FAILED')) {
    return NextResponse.json({ error: 'This booking has no paid charge to refund' }, { status: 409 })
  }

  try {
    // Same idempotency key as the cancellation-flow refund and its retry —
    // this is the same logical operation (refund this booking's payment)
    // triggered from a different admin surface, not a second refund.
    await stripe.refunds.create({
      payment_intent: payment.provider_payment_intent_id,
    }, {
      idempotencyKey: `refund-${booking.id}`,
    })
    await supabase.from('payments').update({
      status: 'REFUNDED',
      refunded_at: new Date().toISOString(),
    }).eq('id', payment.id)

    return NextResponse.json({ status: 'REFUNDED' })
  } catch (refundErr) {
    console.error('Dispute refund failed:', refundErr)
    const message = refundErr instanceof Stripe.errors.StripeError
      ? refundErr.message
      : 'Refund failed'

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
          stripeError:   message,
          adminUrl:      `${BASE_URL}/admin/cancellations`,
        })
      }
    } catch (alertErr) {
      console.error('Dispute-refund-failed admin alert error:', alertErr)
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
