import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { sendDisputeResolvedEmail, sendRefundFailedAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface OverdueDispute {
  id:                 string
  booking_id:         string
  customer_id:        string
  cleaner_profile_id: string
}

// Closes any OPEN dispute past its `resolve_by` SLA deadline with the
// decided default: a full refund to the customer, no admin ruling behind it
// (see the `auto_resolved` column comment in schema.sql for why that
// distinction is tracked separately from an admin's CUSTOMER resolution).
// Called from both the scheduled cron (src/app/api/cron/auto-resolve-disputes)
// and lazily at the top of GET /api/admin/disputes, so a breach resolves
// close to real-time whenever either fires rather than only once a day if
// the Vercel plan caps cron frequency below the 24h window this is meant to
// enforce.
export async function autoResolveOverdueDisputes(
  supabase: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { data, error } = await supabase
    .from('disputes')
    .select('id, booking_id, customer_id, cleaner_profile_id')
    .eq('status', 'OPEN')
    .lt('resolve_by', new Date().toISOString())

  if (error) {
    console.error('autoResolveOverdueDisputes fetch error:', error)
    return 0
  }

  const overdue = (data ?? []) as OverdueDispute[]
  for (const dispute of overdue) {
    await resolveOneOverdueDispute(supabase, dispute)
  }
  return overdue.length
}

async function resolveOneOverdueDispute(
  supabase: ReturnType<typeof createAdminClient>,
  dispute: OverdueDispute
): Promise<void> {
  // Guards against a race with an admin resolving the same dispute between
  // the SELECT in autoResolveOverdueDisputes and this UPDATE — only actually
  // closes it, and only refunds/emails, if it's still OPEN right now.
  const { data: closed, error: updateError } = await supabase
    .from('disputes')
    .update({
      status:             'RESOLVED',
      resolution:         'CUSTOMER',
      refund_percentage:  100,
      auto_resolved:      true,
      resolved_at:        new Date().toISOString(),
    })
    .eq('id', dispute.id)
    .eq('status', 'OPEN')
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error(`autoResolveOverdueDisputes update error (dispute ${dispute.id}):`, updateError)
    return
  }
  if (!closed) return

  // Issue the refund — a full refund, same Stripe call shape as a
  // cancellation refund (bookings/[id]/route.ts), not the partial-split
  // shape the admin UNRESOLVABLE path uses. A failed refund doesn't unwind
  // the resolution — it's flagged for manual follow-up instead, same
  // philosophy as every other refund path in the app.
  try {
    const stripe = getStripe()
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status, amount_eur, provider_payment_intent_id')
      .eq('booking_id', dispute.booking_id)
      .single()

    if (payment?.status === 'PAID' && payment.provider_payment_intent_id) {
      try {
        await stripe.refunds.create({
          payment_intent: payment.provider_payment_intent_id,
        }, {
          idempotencyKey: `dispute-auto-refund-${dispute.booking_id}`,
        })
        await supabase.from('payments').update({
          status:      'REFUNDED',
          refunded_at: new Date().toISOString(),
        }).eq('id', payment.id)
      } catch (refundErr) {
        console.error(`Auto-resolve dispute refund failed (booking ${dispute.booking_id}):`, refundErr)
        await supabase.from('payments').update({ status: 'REFUND_FAILED' }).eq('id', payment.id)

        const { data: customerUser } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', dispute.customer_id)
          .single()
        if (customerUser) {
          await sendRefundFailedAlertEmail({
            bookingId:     dispute.booking_id,
            customerName:  customerUser.full_name,
            customerEmail: customerUser.email,
            amountEur:     payment.amount_eur,
            stripeError:   refundErr instanceof Stripe.errors.StripeError ? refundErr.message : 'Unknown error',
            adminUrl:      `${BASE_URL}/admin/disputes`,
          })
        }
      }
    }
  } catch (err) {
    console.error(`Auto-resolve dispute refund lookup error (booking ${dispute.booking_id}):`, err)
  }

  // Notify both parties — framed the same as an admin ruling (WON/LOST) but
  // with an explanatory note so neither side mistakes this for a considered
  // decision, especially the cleaner (who "lost" only because nobody looked
  // in time, not because anyone found against them).
  try {
    const [{ data: customerUser }, { data: cleanerProfile }, { data: bookingRow }, { data: paymentRow }] = await Promise.all([
      supabase.from('users').select('email, locale, full_name').eq('id', dispute.customer_id).single(),
      supabase.from('cleaner_profiles').select('user_id').eq('id', dispute.cleaner_profile_id).single(),
      supabase.from('bookings').select('date').eq('id', dispute.booking_id).single(),
      supabase.from('payments').select('amount_eur').eq('booking_id', dispute.booking_id).single(),
    ])
    const bookingDate = bookingRow?.date ?? new Date().toISOString().slice(0, 10)

    if (customerUser?.email) {
      const isEl = customerUser.locale === 'el'
      await sendDisputeResolvedEmail({
        to:     customerUser.email,
        locale: customerUser.locale,
        name:   customerUser.full_name,
        bookingDate,
        outcome: 'WON',
        refundAmountEur: paymentRow?.amount_eur,
        note: isEl
          ? 'Αυτή η υπόθεση επιλύθηκε αυτόματα επειδή δεν ολοκληρώσαμε την εξέτασή της εντός του παραθύρου 24 ωρών — σύμφωνα με την πολιτική μας, εκδόθηκε πλήρης επιστροφή χρημάτων.'
          : "This case was auto-resolved because our team didn't complete a review within the 24-hour window — per policy, a full refund was issued.",
        dashboardUrl: `${BASE_URL}/dashboard`,
      })
    }

    if (cleanerProfile?.user_id) {
      const { data: cleanerUser } = await supabase
        .from('users')
        .select('email, locale, full_name')
        .eq('id', cleanerProfile.user_id)
        .single()

      if (cleanerUser?.email) {
        const isEl = cleanerUser.locale === 'el'
        await sendDisputeResolvedEmail({
          to:     cleanerUser.email,
          locale: cleanerUser.locale,
          name:   cleanerUser.full_name,
          bookingDate,
          outcome: 'LOST',
          note: isEl
            ? 'Αυτή η υπόθεση επιλύθηκε αυτόματα επειδή η ομάδα μας δεν ολοκλήρωσε την εξέτασή της εντός του παραθύρου 24 ωρών — αυτό δεν αποτελεί κρίση εις βάρος σας, απλώς την προεπιλεγμένη μας πολιτική όταν δεν προλαβαίνουμε έγκαιρη εξέταση.'
            : "This case was auto-resolved because our team didn't complete a review within the 24-hour window — this isn't a judgment against you, just our default policy when we don't get to a case in time.",
          dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
  } catch (emailErr) {
    console.error(`Email send error (auto-resolve dispute ${dispute.id}):`, emailErr)
  }
}
