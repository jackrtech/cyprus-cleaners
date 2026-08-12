import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminAlertEmail, sendRefundFailedAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Register this endpoint in the Stripe dashboard (Developers → Webhooks →
// Add endpoint → {APP_URL}/api/webhooks/stripe, events below) and put the
// resulting signing secret in STRIPE_WEBHOOK_SECRET. Without it this route
// 400s on every delivery — see the check just below.
//
// Everything else in this app sets payment state synchronously from the
// return value of the Stripe call that triggered it (confirm, refund). This
// route is the only place Stripe's own *async* view of a charge — a bank
// dispute, a delayed failure, a refund that errors after the fact — ever
// reaches the database.
const RELEVANT_EVENTS = new Set([
  'payment_intent.payment_failed',
  'charge.dispute.created',
  'refund.failed',
])

type PaymentRow = {
  id: string
  booking_id: string
  status: string
  amount_eur: number
}

async function alertForPayment(
  supabase: ReturnType<typeof createAdminClient>,
  payment: PaymentRow,
  stripeError: string
) {
  const { data: booking } = await supabase
    .from('bookings')
    .select('customer_id')
    .eq('id', payment.booking_id)
    .single()
  if (!booking) return

  const { data: customerUser } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', booking.customer_id)
    .single()
  if (!customerUser) return

  await sendRefundFailedAlertEmail({
    bookingId:     payment.booking_id,
    customerName:  customerUser.full_name,
    customerEmail: customerUser.email,
    amountEur:     payment.amount_eur,
    stripeError,
    adminUrl:      `${BASE_URL}/admin/cancellations`,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = headers().get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe webhook: missing signature header or STRIPE_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      // The confirm route treats a failed off-session charge as failed
      // synchronously and never marks the booking CONFIRMED — this instead
      // covers the rarer case where Stripe reports failure *after* an
      // apparently-successful synchronous confirm (e.g. a delayed decline).
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const { data: payment } = await supabase
          .from('payments')
          .select('id, booking_id, status, amount_eur')
          .eq('provider_payment_intent_id', pi.id)
          .maybeSingle() as { data: PaymentRow | null }

        if (payment && payment.status !== 'FAILED') {
          await supabase.from('payments').update({ status: 'FAILED' }).eq('id', payment.id)
          await sendAdminAlertEmail({
            subject:  `Payment failed after confirm — booking ${payment.booking_id}`,
            heading:  'A confirmed booking’s charge failed asynchronously',
            bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Stripe reported <strong>${pi.id}</strong> as failed after the fact (${pi.last_payment_error?.message ?? 'no error message given'}). Booking <strong>${payment.booking_id}</strong> is marked CONFIRMED but the payment is now FAILED — needs manual follow-up.</p>`,
          })
        }
        break
      }

      // A customer disputing the charge with their own bank — distinct from
      // this app's in-product "disputes" (quality claims on a completed
      // job). There's no in-app concept of this yet; alerting is the whole
      // handler for now.
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const paymentIntentId = typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id

        const { data: payment } = (paymentIntentId
          ? await supabase
              .from('payments')
              .select('id, booking_id, status, amount_eur')
              .eq('provider_payment_intent_id', paymentIntentId)
              .maybeSingle()
          : { data: null }) as { data: PaymentRow | null }

        await sendAdminAlertEmail({
          subject:  `Bank dispute opened${payment ? ` — booking ${payment.booking_id}` : ''}`,
          heading:  'A customer disputed a charge with their bank',
          bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Reason: <strong>${dispute.reason}</strong>, amount €${(dispute.amount / 100).toFixed(2)}.${payment ? ` Booking <strong>${payment.booking_id}</strong>.` : ' Could not match this to a booking automatically — check the Stripe dashboard.'} This needs a response in the Stripe dashboard before the evidence deadline.</p>`,
        })
        break
      }

      // Mirrors the REFUND_FAILED handling in PATCH /api/bookings/[id] and
      // the retry endpoint, for a refund that fails asynchronously rather
      // than in the immediate stripe.refunds.create() response.
      case 'refund.failed': {
        const refund = event.data.object as Stripe.Refund
        const paymentIntentId = typeof refund.payment_intent === 'string'
          ? refund.payment_intent
          : refund.payment_intent?.id

        if (!paymentIntentId) break

        const { data: payment } = await supabase
          .from('payments')
          .select('id, booking_id, status, amount_eur')
          .eq('provider_payment_intent_id', paymentIntentId)
          .maybeSingle() as { data: PaymentRow | null }

        if (payment && payment.status !== 'REFUND_FAILED') {
          await supabase.from('payments').update({ status: 'REFUND_FAILED' }).eq('id', payment.id)
          await alertForPayment(supabase, payment, refund.failure_reason ?? 'Refund failed asynchronously')
        }
        break
      }
    }
  } catch (handlerErr) {
    // Log and still 200 — a bug in our own handler shouldn't make Stripe
    // retry this delivery indefinitely. Needs manual follow-up if this fires.
    console.error(`Stripe webhook handler error (${event.type}):`, handlerErr)
  }

  return NextResponse.json({ received: true })
}
