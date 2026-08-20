import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { sendAdminAlertEmail } from '@/lib/email'
import { computeNextOccurrenceDate } from '@/lib/recurringBookings'

export const dynamic = 'force-dynamic'

const CHARGE_WINDOW_MS = 72 * 60 * 60 * 1000

type AdminClient = ReturnType<typeof createAdminClient>

interface SeriesRow {
  id: string
  customer_id: string
  cleaner_profile_id: string
  introduction_id: string
  cleaning_type: string
  addon_codes: string[]
  bedrooms: number | null
  bathrooms: number | null
  duration_hours: number
  address: string
  address_lat: number | null
  address_lng: number | null
  finding_us_notes: string | null
  start_time: string
  anchor_date: string
  payment_method_id: string
  tier_rate_eur: number
  platform_fee_eur: number
  addon_total_eur: number
  amount_eur: number
  status: string
}

// Runs once daily via Vercel Cron (see vercel.json) — same Hobby-plan
// once-daily constraint as every other cron in this app. For each ACTIVE
// recurring_series whose first occurrence has been CONFIRMED (see
// schema.sql's recurring_series comment — the cleaner accepting occurrence
// #1 is what starts auto-confirm/auto-charge for every later one), finds
// the next unhandled occurrence date and, if it's within the 72h charge
// window and hasn't been skipped, creates it as a CONFIRMED booking and
// charges the saved card off-session immediately — mirroring the exact
// charge shape PATCH /api/bookings/[id]'s CONFIRM branch already uses, just
// triggered by the cron instead of a cleaner's click.
async function processOneSeries(supabase: AdminClient, series: SeriesRow): Promise<void> {
  const { data: firstBooking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('recurring_series_id', series.id)
    .eq('date', series.anchor_date)
    .maybeSingle()

  if (!firstBooking) return // shouldn't happen — occurrence #1 is created in the same request as the series
  if (firstBooking.status === 'CANCELLED') {
    // The cleaner declined (or the customer cancelled) occurrence #1 —
    // there's no accepted relationship to continue. Clean up the orphaned
    // ACTIVE series so it stops showing up in this scan forever.
    await supabase.from('recurring_series').update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() }).eq('id', series.id).eq('status', 'ACTIVE')
    return
  }
  if (firstBooking.status !== 'CONFIRMED') return // still awaiting the cleaner's accept/decline on #1

  const nextDate = await computeNextOccurrenceDate(supabase, series.id, series.anchor_date)

  const nextOccurrenceMs = new Date(`${nextDate}T${series.start_time}`).getTime()
  if (nextOccurrenceMs - Date.now() > CHARGE_WINDOW_MS) return // not due yet

  const { data: skip } = await supabase
    .from('recurring_series_skips')
    .select('id')
    .eq('recurring_series_id', series.id)
    .eq('occurrence_date', nextDate)
    .maybeSingle()
  if (skip) return // explicitly skipped — the slot just stays open, nothing to create

  const { data: customerUser } = await supabase
    .from('users')
    .select('stripe_customer_id, full_name, email')
    .eq('id', series.customer_id)
    .single()

  if (!customerUser?.stripe_customer_id) {
    console.error(`Recurring charge skipped — no Stripe customer for series ${series.id}`)
    try {
      await sendAdminAlertEmail({
        subject:  `Recurring booking couldn't be charged — series ${series.id}`,
        heading:  'Recurring charge blocked',
        bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Series <strong>${series.id}</strong> (customer <strong>${customerUser?.full_name ?? series.customer_id}</strong>) has no payment account on file — the ${nextDate} occurrence was NOT created or charged. Will retry automatically once the customer's payment method is fixed.</p>`,
      })
    } catch (alertErr) {
      console.error('Recurring-charge-blocked admin alert error:', alertErr)
    }
    return
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      introduction_id:     series.introduction_id,
      customer_id:         series.customer_id,
      cleaner_profile_id:  series.cleaner_profile_id,
      recurring_series_id: series.id,
      service_type:        'HOUSE',
      bedrooms:             series.bedrooms,
      bathrooms:            series.bathrooms,
      cleaning_type:        series.cleaning_type,
      addon_codes:          series.addon_codes,
      date:                 nextDate,
      start_time:           series.start_time,
      duration_hours:       series.duration_hours,
      address:              series.address,
      address_lat:          series.address_lat,
      address_lng:          series.address_lng,
      finding_us_notes:     series.finding_us_notes,
      status:               'CONFIRMED',
    })
    .select('*')
    .single()

  if (bookingError || !booking) {
    console.error(`Recurring occurrence insert error (series ${series.id}):`, bookingError)
    return
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      booking_id:                  booking.id,
      amount_eur:                  series.amount_eur,
      platform_fee_eur:            series.platform_fee_eur,
      tier_rate_eur:                series.tier_rate_eur,
      addon_total_eur:              series.addon_total_eur,
      status:                      'PENDING',
      provider:                    'stripe',
      provider_payment_method_id:  series.payment_method_id,
    })
    .select('*')
    .single()

  if (paymentError || !payment) {
    console.error(`Recurring occurrence payment insert error (booking ${booking.id}):`, paymentError)
    return
  }

  try {
    await supabase.from('messages').insert({
      introduction_id: series.introduction_id,
      sender_id:        series.customer_id,
      booking_id:        booking.id,
      system_event:      'CONFIRMED',
    })
  } catch (msgErr) {
    console.error('System message insert error (recurring occurrence confirmed):', msgErr)
  }

  try {
    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.create({
      amount:          Math.round(series.amount_eur * 100),
      currency:        'eur',
      customer:        customerUser.stripe_customer_id,
      payment_method:  series.payment_method_id,
      off_session:     true,
      confirm:         true,
    }, {
      idempotencyKey: `recurring-charge-${booking.id}`,
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
    // Deliberately does NOT unwind the booking — same philosophy as every
    // other payment-side failure in this app (a failed cancellation refund,
    // a failed payout): the booking stands, the money problem is flagged
    // for a human instead of silently reversing state. Here that means a
    // real gap worth knowing about: the booking is CONFIRMED and the
    // cleaner will show up, but nothing has actually been collected —
    // needs a human to either retry the charge or cancel the booking.
    console.error(`Recurring occurrence charge failed (booking ${booking.id}):`, chargeErr)
    await supabase.from('payments').update({ status: 'FAILED' }).eq('id', payment.id)
    const message = chargeErr instanceof Stripe.errors.StripeError ? chargeErr.message : 'Unknown error'
    try {
      await sendAdminAlertEmail({
        subject:  `Recurring occurrence charge failed — booking ${booking.id}`,
        heading:  'Recurring charge failed',
        bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Booking <strong>${booking.id}</strong> (series <strong>${series.id}</strong>, customer <strong>${customerUser.full_name}</strong>, €${series.amount_eur.toFixed(2)}) was created CONFIRMED for ${nextDate} but the off-session charge failed: ${message}. The booking was NOT cancelled — needs manual follow-up (retry the charge or cancel the booking).</p>`,
      })
    } catch (alertErr) {
      console.error('Recurring-charge-failed admin alert error:', alertErr)
    }
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: seriesRows, error } = await supabase
    .from('recurring_series')
    .select('*')
    .eq('status', 'ACTIVE')

  if (error) {
    console.error('GET cron/charge-recurring fetch error:', error)
    return NextResponse.json({ error: 'Failed to load recurring series' }, { status: 500 })
  }

  for (const series of (seriesRows ?? []) as SeriesRow[]) {
    await processOneSeries(supabase, series)
  }

  return NextResponse.json({ processed: seriesRows?.length ?? 0 })
}
