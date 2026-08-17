import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { sendRefundFailedAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Manual retry for a refund that failed on cancel (payments.status ===
// 'REFUND_FAILED') — surfaced as a button on the admin cancellations ledger.
// { id } is the booking id, matching how the ledger is keyed.
export async function POST(
  req: NextRequest,
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

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, status')
    .eq('id', params.id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, amount_eur, provider_payment_intent_id')
    .eq('booking_id', booking.id)
    .single()

  if (!payment || payment.status !== 'REFUND_FAILED' || !payment.provider_payment_intent_id) {
    return NextResponse.json({ error: 'This booking has no failed refund to retry' }, { status: 409 })
  }

  try {
    const stripe = getStripe()
    // Same idempotency key as the original attempt — if that attempt actually
    // succeeded at Stripe but our own DB update failed, this returns the
    // existing refund instead of creating a second one.
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
    console.error('Refund retry failed:', refundErr)
    const message = refundErr instanceof Stripe.errors.StripeError
      ? refundErr.message
      : 'Refund retry failed'

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
      console.error('Refund-retry-failed admin alert error:', alertErr)
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
