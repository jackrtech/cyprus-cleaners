import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { sendNoShowResolvedEmail, sendRefundFailedAlertEmail, sendAdminAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const VALID_RESOLUTIONS = ['REFUND_CUSTOMER', 'REDIRECT_TO_CLEANER', 'SPLIT'] as const
type Resolution = typeof VALID_RESOLUTIONS[number]

function one<T>(x: T | T[] | null): T | null {
  return Array.isArray(x) ? x[0] ?? null : x
}

interface CleanerProfileRow {
  id: string
  display_name: string
  user_id: string | null
  stripe_connect_account_id: string | null
  stripe_connect_payouts_enabled: boolean
}

// Admin's ruling on a PENDING no-show flag — see schema.sql's no_show_flags
// comment and FLOWS.md §11 for the full workflow this closes out. Reuses the
// same refund/transfer mechanics as PATCH /api/admin/disputes/[id]'s
// multi-cleaner branch (same shareEur formula, same Stripe idempotency
// pattern) rather than a parallel implementation, per the decided spec's
// "same per-assignment dispute-outcome mechanism."
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
  const status: string = body.status
  const note: string | null = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  if (status !== 'CONFIRMED' && status !== 'REJECTED') {
    return NextResponse.json({ error: "status must be 'CONFIRMED' or 'REJECTED'" }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: flagData, error: fetchError } = await supabase
    .from('no_show_flags')
    .select(`
      id, status, booking_id, assignment_id,
      assignment:booking_assignments!no_show_flags_assignment_id_fkey ( id, cleaner_profile_id, tier_rate_eur, platform_fee_eur, payout_status, cleaner_profiles ( id, display_name, user_id ) ),
      booking:bookings ( id, customer_id, date, duration_hours, booking_assignments ( cleaner_profile_id, cleaner_profiles ( id, display_name, user_id, stripe_connect_account_id, stripe_connect_payouts_enabled ) ) )
    `)
    .eq('id', params.id)
    .single()

  if (fetchError || !flagData) {
    return NextResponse.json({ error: 'No-show flag not found' }, { status: 404 })
  }

  interface AssignmentRow { id: string; cleaner_profile_id: string; tier_rate_eur: number; platform_fee_eur: number | null; payout_status: string; cleaner_profiles: { id: string; display_name: string; user_id: string | null } | { id: string; display_name: string; user_id: string | null }[] | null }
  interface BookingRow { id: string; customer_id: string; date: string; duration_hours: number | null; booking_assignments: { cleaner_profile_id: string; cleaner_profiles: CleanerProfileRow | CleanerProfileRow[] | null }[] | null }

  const flag = flagData as unknown as { id: string; status: string; booking_id: string; assignment_id: string; assignment: AssignmentRow | AssignmentRow[] | null; booking: BookingRow | BookingRow[] | null }
  const assignment = one(flag.assignment)
  const booking = one(flag.booking)
  const flaggedCleaner = assignment ? one(assignment.cleaner_profiles) : null

  if (flag.status !== 'PENDING') {
    return NextResponse.json({ error: 'This no-show flag has already been resolved' }, { status: 409 })
  }
  if (!assignment || !booking) {
    return NextResponse.json({ error: "Could not load this flag's booking" }, { status: 500 })
  }

  const [{ data: customerUser }] = await Promise.all([
    supabase.from('users').select('email, locale, full_name').eq('id', booking.customer_id).single(),
  ])
  const bookingDate = booking.date

  // ─── REJECTED — close it out, no money moves, no_show stays false ───
  if (status === 'REJECTED') {
    const { data: updated, error: updateError } = await supabase
      .from('no_show_flags')
      .update({ status: 'REJECTED', admin_note: note, resolved_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      console.error('PATCH admin no-show-flags (reject) error:', updateError)
      return NextResponse.json({ error: 'Failed to resolve the flag' }, { status: 500 })
    }

    try {
      if (customerUser?.email) {
        await sendNoShowResolvedEmail({
          to: customerUser.email, locale: customerUser.locale, name: customerUser.full_name,
          bookingDate, confirmed: false, recipientRole: 'CUSTOMER', note, dashboardUrl: `${BASE_URL}/dashboard`,
        })
      }
      if (flaggedCleaner?.user_id) {
        const { data: flaggedUser } = await supabase.from('users').select('email, locale, full_name').eq('id', flaggedCleaner.user_id).single()
        if (flaggedUser?.email) {
          await sendNoShowResolvedEmail({
            to: flaggedUser.email, locale: flaggedUser.locale, name: flaggedUser.full_name,
            bookingDate, confirmed: false, recipientRole: 'FLAGGED_CLEANER', note, dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
          })
        }
      }
    } catch (emailErr) {
      console.error('Email send error (no-show rejected):', emailErr)
    }

    return NextResponse.json(updated)
  }

  // ─── CONFIRMED — set no_show, then decide where the forfeited share goes ───
  const resolution: Resolution = body.resolution
  if (!VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json({ error: `resolution must be one of ${VALID_RESOLUTIONS.join(', ')}` }, { status: 400 })
  }

  const redirectCleanerProfileId: string | null = typeof body.redirect_cleaner_profile_id === 'string' ? body.redirect_cleaner_profile_id : null
  const splitPercentage: number | null = body.split_percentage !== undefined ? Number(body.split_percentage) : null

  if (resolution === 'REDIRECT_TO_CLEANER' && !redirectCleanerProfileId) {
    return NextResponse.json({ error: 'redirect_cleaner_profile_id is required for REDIRECT_TO_CLEANER' }, { status: 400 })
  }
  if (resolution === 'SPLIT' && (splitPercentage === null || !Number.isInteger(splitPercentage) || splitPercentage < 0 || splitPercentage > 100)) {
    return NextResponse.json({ error: 'split_percentage must be an integer between 0 and 100 for SPLIT' }, { status: 400 })
  }

  let redirectTarget: CleanerProfileRow | null = null
  if (redirectCleanerProfileId) {
    if (redirectCleanerProfileId === assignment.cleaner_profile_id) {
      return NextResponse.json({ error: "Can't redirect to the flagged cleaner themselves" }, { status: 400 })
    }
    const other = (booking.booking_assignments ?? []).find(a => a.cleaner_profile_id === redirectCleanerProfileId)
    const otherProfile = other ? one(other.cleaner_profiles) : null
    if (!otherProfile) {
      return NextResponse.json({ error: 'redirect_cleaner_profile_id must be another cleaner assigned to this booking' }, { status: 400 })
    }
    if (!otherProfile.stripe_connect_payouts_enabled || !otherProfile.stripe_connect_account_id) {
      return NextResponse.json({ error: "That cleaner's Stripe Connect account isn't ready to receive a transfer" }, { status: 409 })
    }
    redirectTarget = otherProfile
  }

  if (!['PENDING', 'BLOCKED'].includes(assignment.payout_status)) {
    return NextResponse.json({ error: `Can't confirm a no-show once payout_status is ${assignment.payout_status}` }, { status: 409 })
  }

  const { error: noShowUpdateError } = await supabase
    .from('booking_assignments')
    .update({ no_show: true })
    .eq('id', assignment.id)
    .eq('payout_status', assignment.payout_status)

  if (noShowUpdateError) {
    console.error('PATCH admin no-show-flags (set no_show) error:', noShowUpdateError)
    return NextResponse.json({ error: 'Failed to mark the assignment as a no-show' }, { status: 500 })
  }

  const shareEur = Math.round((assignment.tier_rate_eur * (booking.duration_hours ?? 0) + (assignment.platform_fee_eur ?? 0)) * 100) / 100
  let refundAmountEur = 0
  let redirectAmountEur = 0
  if (resolution === 'REFUND_CUSTOMER') {
    refundAmountEur = shareEur
  } else if (resolution === 'REDIRECT_TO_CLEANER') {
    redirectAmountEur = shareEur
  } else {
    refundAmountEur = Math.round(shareEur * (splitPercentage! / 100) * 100) / 100
    redirectAmountEur = redirectTarget ? Math.round((shareEur - refundAmountEur) * 100) / 100 : 0
  }

  const stripe = getStripe()

  if (refundAmountEur > 0) {
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status, refunded_amount_eur, provider_payment_intent_id')
      .eq('booking_id', flag.booking_id)
      .single()

    if (payment?.status === 'PAID' && payment.provider_payment_intent_id) {
      try {
        await stripe.refunds.create({
          payment_intent: payment.provider_payment_intent_id,
          amount: Math.round(refundAmountEur * 100),
        }, {
          idempotencyKey: `noshow-refund-${flag.id}`,
        })
        // Running total, not a flat overwrite — this is very likely a
        // partial refund (just one cleaner's share of a multi-cleaner
        // booking), so revenue reporting needs the actual amount, not just
        // the REFUNDED status (see GET /api/admin/analytics).
        await supabase.from('payments').update({
          status: 'REFUNDED',
          refunded_at: new Date().toISOString(),
          refunded_amount_eur: (payment.refunded_amount_eur ?? 0) + refundAmountEur,
        }).eq('id', payment.id)
      } catch (refundErr) {
        console.error('No-show refund failed:', refundErr)
        await supabase.from('payments').update({ status: 'REFUND_FAILED' }).eq('id', payment.id)
        if (customerUser) {
          try {
            await sendRefundFailedAlertEmail({
              bookingId:     flag.booking_id,
              customerName:  customerUser.full_name,
              customerEmail: customerUser.email,
              amountEur:     refundAmountEur,
              stripeError:   refundErr instanceof Stripe.errors.StripeError ? refundErr.message : 'Unknown error',
              adminUrl:      `${BASE_URL}/admin/team-bookings`,
            })
          } catch (alertErr) {
            console.error('Refund-failed admin alert error:', alertErr)
          }
        }
      }
    }
  }

  if (redirectAmountEur > 0 && redirectTarget) {
    try {
      await stripe.transfers.create({
        amount:         Math.round(redirectAmountEur * 100),
        currency:       'eur',
        destination:    redirectTarget.stripe_connect_account_id!,
        transfer_group: `booking_${booking.id}`,
      }, {
        idempotencyKey: `noshow-redirect-${flag.id}`,
      })
    } catch (transferErr) {
      console.error('No-show redirect transfer failed:', transferErr)
      redirectAmountEur = 0
      try {
        await sendAdminAlertEmail({
          subject:  `No-show redirect transfer failed — booking ${flag.booking_id}`,
          heading:  'No-show redirect transfer failed',
          bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Redirecting a no-show cleaner's forfeited €${shareEur.toFixed(2)} to <strong>${redirectTarget.display_name}</strong> failed on booking <strong>${flag.booking_id}</strong>. Needs manual follow-up in the Stripe dashboard.</p>`,
        })
      } catch (alertErr) {
        console.error('Redirect-failed admin alert error:', alertErr)
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('no_show_flags')
    .update({
      status:                       'CONFIRMED',
      resolution,
      redirect_cleaner_profile_id:  redirectTarget?.id ?? null,
      split_percentage:             resolution === 'SPLIT' ? splitPercentage : null,
      refund_amount_eur:            refundAmountEur,
      redirect_amount_eur:          redirectAmountEur,
      admin_note:                   note,
      resolved_at:                  new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH admin no-show-flags (confirm) error:', updateError)
    return NextResponse.json({ error: 'Failed to resolve the flag' }, { status: 500 })
  }

  try {
    if (customerUser?.email) {
      await sendNoShowResolvedEmail({
        to: customerUser.email, locale: customerUser.locale, name: customerUser.full_name,
        bookingDate, confirmed: true, recipientRole: 'CUSTOMER',
        amountEur: refundAmountEur > 0 ? refundAmountEur : undefined,
        note, dashboardUrl: `${BASE_URL}/dashboard`,
      })
    }
    if (flaggedCleaner?.user_id) {
      const { data: flaggedUser } = await supabase.from('users').select('email, locale, full_name').eq('id', flaggedCleaner.user_id).single()
      if (flaggedUser?.email) {
        await sendNoShowResolvedEmail({
          to: flaggedUser.email, locale: flaggedUser.locale, name: flaggedUser.full_name,
          bookingDate, confirmed: true, recipientRole: 'FLAGGED_CLEANER', note, dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
    if (redirectAmountEur > 0 && redirectTarget?.user_id) {
      const { data: redirectUser } = await supabase.from('users').select('email, locale, full_name').eq('id', redirectTarget.user_id).single()
      if (redirectUser?.email) {
        await sendNoShowResolvedEmail({
          to: redirectUser.email, locale: redirectUser.locale, name: redirectUser.full_name,
          bookingDate, confirmed: true, recipientRole: 'REDIRECT_CLEANER',
          amountEur: redirectAmountEur, note, dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
  } catch (emailErr) {
    console.error('Email send error (no-show resolved):', emailErr)
  }

  return NextResponse.json(updated)
}
