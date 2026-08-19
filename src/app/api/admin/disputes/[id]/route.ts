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

// Shared by both branches below: CUSTOMER is always 100%, CLEANER always 0%,
// UNRESOLVABLE takes the admin's chosen split (defaulting to 50).
function resolvePercentage(resolution: Resolution, requested: unknown): number | null {
  if (resolution === 'CUSTOMER') return 100
  if (resolution === 'CLEANER') return 0
  const pct = requested !== undefined ? Number(requested) : DEFAULT_UNRESOLVABLE_REFUND_PERCENTAGE
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return null
  return pct
}

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
  const note: string | null = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

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

  // ─── Single-cleaner dispute — unchanged from before multi-cleaner bookings existed ───
  if (dispute.cleaner_profile_id) {
    const resolution: Resolution = body.resolution
    if (!VALID_RESOLUTIONS.includes(resolution)) {
      return NextResponse.json({ error: `resolution must be one of ${VALID_RESOLUTIONS.join(', ')}` }, { status: 400 })
    }
    const refundPercentage = resolvePercentage(resolution, body.refund_percentage)
    if (refundPercentage === null) {
      return NextResponse.json({ error: 'refund_percentage must be an integer between 0 and 100' }, { status: 400 })
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
            await supabase.from('payments').update({
              status: 'REFUNDED',
              refunded_at: new Date().toISOString(),
            }).eq('id', payment.id)
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
      const [{ data: customerUser }, { data: cleanerProfile }, { data: bookingRow }, { data: paymentRow }] = await Promise.all([
        supabase.from('users').select('email, locale, full_name').eq('id', dispute.customer_id).single(),
        supabase.from('cleaner_profiles').select('user_id').eq('id', dispute.cleaner_profile_id).single(),
        supabase.from('bookings').select('date').eq('id', dispute.booking_id).single(),
        supabase.from('payments').select('amount_eur').eq('booking_id', dispute.booking_id).single(),
      ])
      const bookingDate = bookingRow?.date ?? new Date().toISOString().slice(0, 10)
      const customerRefundAmountEur = paymentRow && (resolution === 'CUSTOMER' || resolution === 'UNRESOLVABLE')
        ? Math.round(paymentRow.amount_eur * (refundPercentage / 100) * 100) / 100
        : undefined

      if (customerUser?.email) {
        await sendDisputeResolvedEmail({
          to: customerUser.email,
          locale: customerUser.locale,
          name: customerUser.full_name,
          bookingDate,
          outcome: resolution === 'CUSTOMER' ? 'WON' : resolution === 'UNRESOLVABLE' ? 'UNRESOLVABLE' : 'LOST',
          note,
          dashboardUrl: `${BASE_URL}/dashboard`,
          refundPercentage: resolution === 'UNRESOLVABLE' ? refundPercentage : undefined,
          refundAmountEur: resolution === 'CUSTOMER' ? customerRefundAmountEur : undefined,
        })
      }

      if (cleanerProfile?.user_id) {
        const { data: cleanerUser } = await supabase
          .from('users')
          .select('email, locale, full_name')
          .eq('id', cleanerProfile.user_id)
          .single()

        if (cleanerUser?.email) {
          await sendDisputeResolvedEmail({
            to: cleanerUser.email,
            locale: cleanerUser.locale,
            name: cleanerUser.full_name,
            bookingDate,
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

  // ─── Multi-cleaner dispute — one ruling per assigned cleaner ───
  // Added 2026-08-19 (stage 4 of the multi-cleaner plan, see FLOWS.md §11).
  // The claim itself is always whole-job (dispute.cleaner_profile_id is null
  // here); the admin rules on each assigned cleaner separately, written to
  // dispute_assignment_outcomes rather than disputes.resolution/
  // refund_percentage (which stay null/0 for this kind of dispute).
  interface AssignmentEntry { cleaner_profile_id: string; resolution: Resolution; refund_percentage?: unknown }
  const rawAssignments: AssignmentEntry[] = Array.isArray(body.assignments) ? body.assignments : []
  if (rawAssignments.length === 0) {
    return NextResponse.json({ error: 'assignments is required to resolve a multi-cleaner dispute' }, { status: 400 })
  }

  const { data: bookingRow } = await supabase
    .from('bookings')
    .select('date, duration_hours')
    .eq('id', dispute.booking_id)
    .single()
  interface RealAssignmentRow {
    cleaner_profile_id: string
    tier_rate_eur: number
    platform_fee_eur: number | null
    cleaner_profiles: { user_id: string | null } | { user_id: string | null }[] | null
  }
  const { data: realAssignmentsData } = await supabase
    .from('booking_assignments')
    .select('cleaner_profile_id, tier_rate_eur, platform_fee_eur, cleaner_profiles ( user_id )')
    .eq('booking_id', dispute.booking_id)
  const realAssignments = realAssignmentsData as unknown as RealAssignmentRow[] | null

  if (!bookingRow || !realAssignments || realAssignments.length === 0) {
    return NextResponse.json({ error: "Could not load this booking's assignments" }, { status: 500 })
  }

  const realIds = new Set(realAssignments.map(a => a.cleaner_profile_id))
  const submittedIds = new Set(rawAssignments.map(a => a.cleaner_profile_id))
  const idsMatch = realIds.size === submittedIds.size && [...realIds].every((id: string) => submittedIds.has(id))
  if (!idsMatch) {
    return NextResponse.json({ error: 'assignments must cover exactly the cleaners assigned to this booking, no more and no less' }, { status: 400 })
  }

  type Resolved = { cleaner_profile_id: string; resolution: Resolution; refund_percentage: number; shareEur: number; cleanerUserId: string | null }
  const resolved: Resolved[] = []
  for (const entry of rawAssignments) {
    if (!VALID_RESOLUTIONS.includes(entry.resolution)) {
      return NextResponse.json({ error: `Each assignment's resolution must be one of ${VALID_RESOLUTIONS.join(', ')}` }, { status: 400 })
    }
    const refundPercentage = resolvePercentage(entry.resolution, entry.refund_percentage)
    if (refundPercentage === null) {
      return NextResponse.json({ error: 'Each UNRESOLVABLE refund_percentage must be an integer between 0 and 100' }, { status: 400 })
    }
    const real = realAssignments.find((a: RealAssignmentRow) => a.cleaner_profile_id === entry.cleaner_profile_id)!
    const cleanerProfileRow = real.cleaner_profiles
    const cleanerUserId = Array.isArray(cleanerProfileRow) ? cleanerProfileRow[0]?.user_id ?? null : cleanerProfileRow?.user_id ?? null
    // A cleaner's own "share" of the total charge — their rate for this job
    // plus their own flat booking fee — is what a 100%/0%/split ruling
    // actually applies against, not the combined total.
    const shareEur = real.tier_rate_eur * (bookingRow.duration_hours ?? 0) + (real.platform_fee_eur ?? 0)
    resolved.push({ cleaner_profile_id: entry.cleaner_profile_id, resolution: entry.resolution, refund_percentage: refundPercentage, shareEur, cleanerUserId })
  }

  // Insert the per-cleaner outcomes BEFORE marking the dispute resolved — if
  // this fails, the dispute stays OPEN and the admin can just retry, rather
  // than ending up "resolved" with no record of what was actually decided.
  const { error: outcomesError } = await supabase.from('dispute_assignment_outcomes').insert(
    resolved.map(r => ({
      dispute_id: dispute.id,
      cleaner_profile_id: r.cleaner_profile_id,
      resolution: r.resolution,
      refund_percentage: r.refund_percentage,
    }))
  )
  if (outcomesError) {
    console.error('PATCH admin dispute (multi-cleaner outcomes) error:', outcomesError)
    return NextResponse.json({ error: 'Failed to record the per-cleaner resolution' }, { status: 500 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('disputes')
    .update({ status: 'RESOLVED', admin_note: note, resolved_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH admin dispute error:', updateError)
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 })
  }

  // Blended refund — the combined charge is one Stripe PaymentIntent
  // regardless of how many cleaners were on the job, so a mixed ruling
  // (e.g. one cleaner CUSTOMER-favor, another CLEANER-favor) still resolves
  // to exactly one refund, sized to the sum of each cleaner's own share ×
  // their own ruling. Always auto-issued here, same as UNRESOLVABLE above —
  // there's no clean single "resolution" value on a multi-cleaner dispute to
  // gate a separate manual-refund button on, so a blended ruling is treated
  // the same way a split ruling already is.
  const totalRefundEur = Math.round(resolved.reduce((sum, r) => sum + r.shareEur * (r.refund_percentage / 100), 0) * 100) / 100
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, amount_eur, provider_payment_intent_id')
    .eq('booking_id', dispute.booking_id)
    .single()

  if (totalRefundEur > 0 && payment?.status === 'PAID' && payment.provider_payment_intent_id) {
    try {
      const stripe = getStripe()
      await stripe.refunds.create({
        payment_intent: payment.provider_payment_intent_id,
        amount: Math.round(totalRefundEur * 100),
      }, {
        idempotencyKey: `dispute-multi-refund-${dispute.booking_id}`,
      })
      await supabase.from('payments').update({
        status: 'REFUNDED',
        refunded_at: new Date().toISOString(),
      }).eq('id', payment.id)
    } catch (refundErr) {
      console.error('Dispute multi-cleaner refund failed:', refundErr)
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
          amountEur:     totalRefundEur,
          stripeError:   refundErr instanceof Stripe.errors.StripeError ? refundErr.message : 'Unknown error',
          adminUrl:      `${BASE_URL}/admin/disputes`,
        })
      }
    }
  }

  // Notify the customer once (blended outcome) and each cleaner separately
  // with their own true personal ruling — non-blocking, errors swallowed.
  try {
    const [{ data: customerUser }, { data: cleanerUsers }] = await Promise.all([
      supabase.from('users').select('email, locale, full_name').eq('id', dispute.customer_id).single(),
      supabase.from('users').select('id, email, locale, full_name').in('id', resolved.map(r => r.cleanerUserId).filter((id): id is string => !!id)),
    ])
    const bookingDate = bookingRow.date

    if (customerUser?.email) {
      const blendedPercentage = payment?.amount_eur ? Math.round((totalRefundEur / payment.amount_eur) * 100) : 0
      await sendDisputeResolvedEmail({
        to: customerUser.email,
        locale: customerUser.locale,
        name: customerUser.full_name,
        bookingDate,
        outcome: 'UNRESOLVABLE',
        note,
        dashboardUrl: `${BASE_URL}/dashboard`,
        refundPercentage: blendedPercentage,
      })
    }

    for (const r of resolved) {
      const cleanerUser = (cleanerUsers ?? []).find((u: { id: string }) => u.id === r.cleanerUserId)
      if (!cleanerUser?.email) continue
      await sendDisputeResolvedEmail({
        to: cleanerUser.email,
        locale: cleanerUser.locale,
        name: cleanerUser.full_name,
        bookingDate,
        outcome: r.resolution === 'CLEANER' ? 'WON' : r.resolution === 'UNRESOLVABLE' ? 'UNRESOLVABLE' : 'LOST',
        note,
        dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
      })
    }
  } catch (emailErr) {
    console.error('Email send error (multi-cleaner dispute resolved):', emailErr)
  }

  return NextResponse.json(updated)
}
