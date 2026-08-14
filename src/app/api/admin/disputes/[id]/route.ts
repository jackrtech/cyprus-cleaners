import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { sendDisputeResolvedEmail, sendRefundFailedAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const DEFAULT_UNRESOLVABLE_REFUND_PERCENTAGE = 50

const VALID_RESOLUTIONS = ['CUSTOMER', 'CLEANER', 'UNRESOLVABLE'] as const
type Resolution = typeof VALID_RESOLUTIONS[number]

export async function PATCH(
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

  const body = await req.json()
  const resolution: Resolution = body.resolution
  const note: string | null = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  if (!VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json(
      { error: `resolution must be one of ${VALID_RESOLUTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  let refundPercentage = 0
  if (resolution === 'CUSTOMER') refundPercentage = 100
  if (resolution === 'UNRESOLVABLE') {
    refundPercentage = body.refund_percentage !== undefined ? Number(body.refund_percentage) : DEFAULT_UNRESOLVABLE_REFUND_PERCENTAGE
    if (!Number.isInteger(refundPercentage) || refundPercentage < 0 || refundPercentage > 100) {
      return NextResponse.json({ error: 'refund_percentage must be an integer between 0 and 100' }, { status: 400 })
    }
  }

  const supabase = createAdminClient()

  const { data: dispute, error: fetchError } = await supabase
    .from('disputes')
    .select('id, status, booking_id, customer_id, cleaner_profile_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
  }
  if (dispute.status !== 'OPEN') {
    return NextResponse.json({ error: 'This dispute has already been resolved' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('disputes')
    .update({
      status: 'RESOLVED',
      resolution,
      refund_percentage: refundPercentage,
      admin_note: note,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH admin dispute error:', updateError)
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 })
  }

  // UNRESOLVABLE issues its partial refund automatically, right here — unlike
  // CUSTOMER (which stays a deliberate manual action via the refund button;
  // see FLOWS.md §7, resolution doesn't auto-move money there) since a split
  // decision has no separate admin step to trigger it from. A failed refund
  // does NOT unwind the resolution decision — same philosophy as a failed
  // cancellation refund: the decision stands, the money problem gets flagged
  // and retried separately instead of blocking the ruling.
  if (resolution === 'UNRESOLVABLE' && refundPercentage > 0) {
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
            amount: Math.round(payment.amount_eur * (refundPercentage / 100) * 100),
          }, {
            idempotencyKey: `dispute-split-refund-${dispute.booking_id}`,
          })
        } catch (refundErr) {
          console.error('Dispute UNRESOLVABLE refund failed:', refundErr)
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
              amountEur:     Math.round(payment.amount_eur * (refundPercentage / 100) * 100) / 100,
              stripeError:   refundErr instanceof Stripe.errors.StripeError ? refundErr.message : 'Unknown error',
              adminUrl:      `${BASE_URL}/admin/disputes`,
            })
          }
        }
      }
    } catch (err) {
      console.error('Dispute UNRESOLVABLE refund lookup error:', err)
    }
  }

  // Notify both parties of the outcome — non-blocking, errors are swallowed
  try {
    const [{ data: customerUser }, { data: cleanerProfile }] = await Promise.all([
      supabase.from('users').select('email, locale').eq('id', dispute.customer_id).single(),
      supabase.from('cleaner_profiles').select('user_id').eq('id', dispute.cleaner_profile_id).single(),
    ])

    if (customerUser?.email) {
      await sendDisputeResolvedEmail({
        to: customerUser.email,
        locale: customerUser.locale,
        outcome: resolution === 'CUSTOMER' ? 'WON' : resolution === 'UNRESOLVABLE' ? 'UNRESOLVABLE' : 'LOST',
        note,
        dashboardUrl: `${BASE_URL}/dashboard`,
        refundPercentage: resolution === 'UNRESOLVABLE' ? refundPercentage : undefined,
      })
    }

    if (cleanerProfile?.user_id) {
      const { data: cleanerUser } = await supabase
        .from('users')
        .select('email, locale')
        .eq('id', cleanerProfile.user_id)
        .single()

      if (cleanerUser?.email) {
        await sendDisputeResolvedEmail({
          to: cleanerUser.email,
          locale: cleanerUser.locale,
          outcome: resolution === 'CLEANER' ? 'WON' : resolution === 'UNRESOLVABLE' ? 'UNRESOLVABLE' : 'LOST',
          note,
          dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
  } catch (emailErr) {
    console.error('Email send error (dispute resolved):', emailErr)
  }

  return NextResponse.json(updated)
}
