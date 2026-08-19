import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { getStripe, PAYOUT_HOLD_MS } from '@/lib/stripe'
import { sendAdminAlertEmail } from '@/lib/email'

interface DisputeRow {
  status:            string
  resolution:        string | null
  refund_percentage: number
}

interface CleanerProfileRow {
  id:                              string
  stripe_connect_account_id:       string | null
  stripe_connect_payouts_enabled:  boolean
}

interface BookingRow {
  id:                 string
  status:             string
  completed_at:       string | null
  cleaner_profile_id: string
  disputes:           DisputeRow | DisputeRow[] | null
  cleaner_profiles:   CleanerProfileRow | CleanerProfileRow[] | null
}

interface PayoutCandidateRow {
  id:                string
  booking_id:        string
  amount_eur:         number
  platform_fee_eur:  number | null
  payout_status:     string
  booking:           BookingRow | BookingRow[] | null
}

function one<T>(x: T | T[] | null): T | null {
  return Array.isArray(x) ? x[0] ?? null : x
}

// Decides whether a completed booking's payout is ready to move, and for
// how much. Deliberately re-derived live every time rather than trusting
// `payments.payout_release_at` — that column is only a display hint for the
// cleaner's earnings view; an open dispute holds the real payout well past
// it, and a resolved dispute changes the amount, neither of which the
// booking-completion-time stamp knows about.
function evaluateReadiness(booking: BookingRow): { ready: boolean; refundPercentage: number } {
  const dispute = one(booking.disputes)

  if (dispute?.status === 'OPEN') return { ready: false, refundPercentage: 0 }
  if (dispute?.status === 'RESOLVED') return { ready: true, refundPercentage: dispute.refund_percentage }

  // No dispute at all — ready once the plain post-completion hold elapses.
  const completedAt = booking.completed_at ? new Date(booking.completed_at).getTime() : null
  const ready = completedAt !== null && Date.now() - completedAt >= PAYOUT_HOLD_MS
  return { ready, refundPercentage: 0 }
}

async function processOneCandidate(
  supabase: ReturnType<typeof createAdminClient>,
  row: PayoutCandidateRow
): Promise<void> {
  const booking = one(row.booking)
  if (!booking || booking.status !== 'COMPLETED') return

  const { ready, refundPercentage } = evaluateReadiness(booking)
  if (!ready) return

  const rateEur = row.amount_eur - (row.platform_fee_eur ?? 0)
  const finalPayoutEur = Math.max(0, Math.round(rateEur * (1 - refundPercentage / 100) * 100) / 100)

  // Nothing owed — a fully (or, after rounding, effectively fully) refunded
  // dispute. No transfer to make; done.
  if (finalPayoutEur <= 0) {
    await supabase.from('payments')
      .update({ payout_status: 'PAID', cleaner_payout_eur: 0, paid_out_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)
    return
  }

  const cleanerProfile = one(booking.cleaner_profiles)

  if (!cleanerProfile?.stripe_connect_payouts_enabled || !cleanerProfile.stripe_connect_account_id) {
    // Amount is known, cleaner isn't ready to receive it yet — queued.
    // Released immediately (not on the next sweep) by the account.updated
    // webhook once they finish onboarding — see releaseBlockedPayoutsForCleaner.
    await supabase.from('payments')
      .update({ payout_status: 'BLOCKED', cleaner_payout_eur: finalPayoutEur })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)
    return
  }

  try {
    const stripe = getStripe()
    const transfer = await stripe.transfers.create({
      amount:          Math.round(finalPayoutEur * 100),
      currency:        'eur',
      destination:     cleanerProfile.stripe_connect_account_id,
      transfer_group:  `booking_${booking.id}`,
    }, {
      // Scoped to the booking, not the payment row, so a retry after a
      // BLOCKED→ready transition never double-transfers even if this
      // function somehow runs twice for the same booking.
      idempotencyKey: `payout-${booking.id}`,
    })

    await supabase.from('payments')
      .update({
        payout_status:       'PAID',
        cleaner_payout_eur:  finalPayoutEur,
        stripe_transfer_id:  transfer.id,
        paid_out_at:         new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)
  } catch (transferErr) {
    console.error(`Payout transfer failed (booking ${booking.id}):`, transferErr)
    await supabase.from('payments')
      .update({ payout_status: 'FAILED', cleaner_payout_eur: finalPayoutEur })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)

    try {
      await sendAdminAlertEmail({
        subject:  `Cleaner payout failed — booking ${booking.id}`,
        heading:  'A cleaner payout transfer failed',
        bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Booking <strong>${booking.id}</strong> owed the cleaner <strong>€${finalPayoutEur.toFixed(2)}</strong>, but the Stripe transfer errored: ${transferErr instanceof Stripe.errors.StripeError ? transferErr.message : 'Unknown error'}. Needs manual follow-up — check the connected account's status in the Stripe dashboard before retrying.</p>`,
      })
    } catch (alertErr) {
      console.error('Payout-failed admin alert error:', alertErr)
    }
  }
}

const CANDIDATE_SELECT = `
  id, booking_id, amount_eur, platform_fee_eur, payout_status,
  booking:bookings (
    id, status, completed_at, cleaner_profile_id,
    disputes ( status, resolution, refund_percentage ),
    cleaner_profiles ( id, stripe_connect_account_id, stripe_connect_payouts_enabled )
  )
`

// ─── Multi-cleaner bookings (booking_assignments) ────────────────────────
// Added 2026-08-19, stage 3 of the multi-cleaner plan (see FLOWS.md §11).
// A second, parallel candidate path — the single-cleaner path above is
// completely untouched. A multi-cleaner booking has no `payments.
// cleaner_payout_eur` to move (that table only ever holds the combined
// customer charge for these bookings); each `booking_assignments` row is
// its own independent payout, scoped to one cleaner's own `tier_rate_eur`.
//
// Readiness (is the dispute window/hold clear) is still governed by the
// booking's single `disputes` row, same as single-cleaner — a dispute on a
// multi-cleaner booking is always filed against the whole job (§11). What
// differs is the refund PERCENTAGE: single-cleaner reads it straight off
// `disputes.refund_percentage`; multi-cleaner looks up this specific
// cleaner's own ruling in `dispute_assignment_outcomes` (0% if the dispute
// resolved without naming this cleaner, or if there's no dispute at all).
// `no_show` is an independent, unconditional override — a no-show cleaner
// is owed nothing regardless of any dispute outcome.

interface AssignmentDisputeRow {
  id:     string
  status: string
}

interface AssignmentBookingRow {
  id:             string
  status:         string
  completed_at:   string | null
  duration_hours: number
  disputes:       AssignmentDisputeRow | AssignmentDisputeRow[] | null
}

interface AssignmentCandidateRow {
  id:                 string
  booking_id:         string
  cleaner_profile_id: string
  tier_rate_eur:      number
  payout_status:      string
  no_show:            boolean
  booking:            AssignmentBookingRow | AssignmentBookingRow[] | null
  cleaner_profiles:   CleanerProfileRow | CleanerProfileRow[] | null
}

const ASSIGNMENT_CANDIDATE_SELECT = `
  id, booking_id, cleaner_profile_id, tier_rate_eur, payout_status, no_show,
  booking:bookings (
    id, status, completed_at, duration_hours,
    disputes ( id, status )
  ),
  cleaner_profiles ( id, stripe_connect_account_id, stripe_connect_payouts_enabled )
`

async function resolveAssignmentRefundPercentage(
  supabase: ReturnType<typeof createAdminClient>,
  dispute: AssignmentDisputeRow | null,
  cleanerProfileId: string
): Promise<{ ready: boolean; refundPercentage: number }> {
  if (dispute?.status === 'OPEN') return { ready: false, refundPercentage: 0 }
  if (dispute?.status !== 'RESOLVED') return { ready: true, refundPercentage: 0 }  // no dispute at all — hold-window readiness is checked by the caller

  const { data: outcome } = await supabase
    .from('dispute_assignment_outcomes')
    .select('refund_percentage')
    .eq('dispute_id', dispute.id)
    .eq('cleaner_profile_id', cleanerProfileId)
    .maybeSingle()

  // Resolved but no ruling against this specific cleaner — nothing withheld.
  return { ready: true, refundPercentage: outcome?.refund_percentage ?? 0 }
}

async function processOneAssignmentCandidate(
  supabase: ReturnType<typeof createAdminClient>,
  row: AssignmentCandidateRow
): Promise<void> {
  const booking = one(row.booking)
  if (!booking || booking.status !== 'COMPLETED') return

  const dispute = one(booking.disputes)
  const { ready: disputeReady, refundPercentage } = await resolveAssignmentRefundPercentage(supabase, dispute, row.cleaner_profile_id)
  if (!disputeReady) return

  // No dispute at all — same post-completion hold as the single-cleaner path.
  if (!dispute) {
    const completedAt = booking.completed_at ? new Date(booking.completed_at).getTime() : null
    const holdElapsed = completedAt !== null && Date.now() - completedAt >= PAYOUT_HOLD_MS
    if (!holdElapsed) return
  }

  const rateEur = row.tier_rate_eur * booking.duration_hours
  const finalPayoutEur = row.no_show
    ? 0
    : Math.max(0, Math.round(rateEur * (1 - refundPercentage / 100) * 100) / 100)

  if (finalPayoutEur <= 0) {
    await supabase.from('booking_assignments')
      .update({ payout_status: 'PAID', cleaner_payout_eur: 0, paid_out_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)
    return
  }

  const cleanerProfile = one(row.cleaner_profiles)

  if (!cleanerProfile?.stripe_connect_payouts_enabled || !cleanerProfile.stripe_connect_account_id) {
    await supabase.from('booking_assignments')
      .update({ payout_status: 'BLOCKED', cleaner_payout_eur: finalPayoutEur })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)
    return
  }

  try {
    const stripe = getStripe()
    const transfer = await stripe.transfers.create({
      amount:          Math.round(finalPayoutEur * 100),
      currency:        'eur',
      destination:     cleanerProfile.stripe_connect_account_id,
      // Shared across every assigned cleaner's transfer on this booking —
      // transfer_group is meant to link multiple transfers back to the one
      // originating charge, which is exactly the multi-cleaner case.
      transfer_group:  `booking_${booking.id}`,
    }, {
      // Scoped to this specific assignment, not just the booking — a
      // multi-cleaner booking fires N transfers off one charge, so the key
      // must include which cleaner to avoid only ever paying the first one.
      idempotencyKey: `payout-${booking.id}-${row.cleaner_profile_id}`,
    })

    await supabase.from('booking_assignments')
      .update({
        payout_status:       'PAID',
        cleaner_payout_eur:  finalPayoutEur,
        stripe_transfer_id:  transfer.id,
        paid_out_at:         new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)
  } catch (transferErr) {
    console.error(`Payout transfer failed (booking ${booking.id}, cleaner ${row.cleaner_profile_id}):`, transferErr)
    await supabase.from('booking_assignments')
      .update({ payout_status: 'FAILED', cleaner_payout_eur: finalPayoutEur })
      .eq('id', row.id)
      .eq('payout_status', row.payout_status)

    try {
      await sendAdminAlertEmail({
        subject:  `Cleaner payout failed — booking ${booking.id}`,
        heading:  'A cleaner payout transfer failed',
        bodyHtml: `<p style="color:#0D1F1E;font-size:14px;line-height:1.6;margin:0;">Multi-cleaner booking <strong>${booking.id}</strong> owed cleaner <strong>${row.cleaner_profile_id}</strong> <strong>€${finalPayoutEur.toFixed(2)}</strong>, but the Stripe transfer errored: ${transferErr instanceof Stripe.errors.StripeError ? transferErr.message : 'Unknown error'}. Needs manual follow-up — check the connected account's status in the Stripe dashboard before retrying.</p>`,
      })
    } catch (alertErr) {
      console.error('Payout-failed admin alert error:', alertErr)
    }
  }
}

// ─── Manual admin retry for a FAILED payout ──────────────────────────────
// Added 2026-08-19: releaseDuePayouts only ever re-scans PENDING/BLOCKED —
// once a transfer attempt throws, the row sits at FAILED forever with no
// automatic retry. These two are called from admin-triggered retry routes
// (mirrors the existing cancellations retry-refund pattern). Deliberately
// NOT a rescan of readiness/dispute logic — that already ran once to reach
// FAILED in the first place; a retry just re-attempts the same transfer for
// the same already-computed amount, with the same idempotency key as the
// original attempt (so if that attempt actually succeeded at Stripe but our
// own DB update failed, this returns the existing transfer instead of
// creating a second one).

interface RetryPaymentRow {
  id:                 string
  booking_id:         string
  cleaner_payout_eur: number | null
  payout_status:      string
  booking:            { id: string; cleaner_profiles: CleanerProfileRow | CleanerProfileRow[] | null } | { id: string; cleaner_profiles: CleanerProfileRow | CleanerProfileRow[] | null }[] | null
}

export async function retryFailedPayout(
  supabase: ReturnType<typeof createAdminClient>,
  paymentId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      id, booking_id, cleaner_payout_eur, payout_status,
      booking:bookings ( id, cleaner_profiles ( id, stripe_connect_account_id, stripe_connect_payouts_enabled ) )
    `)
    .eq('id', paymentId)
    .single()

  if (error || !data) return { ok: false, status: 404, error: 'Payment not found' }
  const row = data as unknown as RetryPaymentRow

  if (row.payout_status !== 'FAILED') {
    return { ok: false, status: 409, error: `Payout is ${row.payout_status}, not FAILED — nothing to retry` }
  }
  if (!row.cleaner_payout_eur || row.cleaner_payout_eur <= 0) {
    return { ok: false, status: 409, error: 'No payout amount recorded for this payment' }
  }

  const booking = one(row.booking)
  const cleanerProfile = booking ? one(booking.cleaner_profiles) : null
  if (!cleanerProfile?.stripe_connect_payouts_enabled || !cleanerProfile.stripe_connect_account_id) {
    return { ok: false, status: 409, error: "Cleaner's Stripe Connect account isn't ready to receive payouts" }
  }

  try {
    const stripe = getStripe()
    const transfer = await stripe.transfers.create({
      amount:          Math.round(row.cleaner_payout_eur * 100),
      currency:        'eur',
      destination:     cleanerProfile.stripe_connect_account_id,
      transfer_group:  `booking_${row.booking_id}`,
    }, {
      idempotencyKey: `payout-${row.booking_id}`,
    })

    await supabase.from('payments')
      .update({ payout_status: 'PAID', stripe_transfer_id: transfer.id, paid_out_at: new Date().toISOString() })
      .eq('id', row.id)

    return { ok: true }
  } catch (transferErr) {
    console.error(`Payout retry failed (payment ${row.id}):`, transferErr)
    const message = transferErr instanceof Stripe.errors.StripeError ? transferErr.message : 'Transfer failed'
    return { ok: false, status: 502, error: message }
  }
}

interface RetryAssignmentRow {
  id:                 string
  booking_id:         string
  cleaner_payout_eur: number | null
  payout_status:      string
  cleaner_profiles:   CleanerProfileRow | CleanerProfileRow[] | null
}

export async function retryFailedAssignmentPayout(
  supabase: ReturnType<typeof createAdminClient>,
  assignmentId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase
    .from('booking_assignments')
    .select(`
      id, booking_id, cleaner_profile_id, cleaner_payout_eur, payout_status,
      cleaner_profiles ( id, stripe_connect_account_id, stripe_connect_payouts_enabled )
    `)
    .eq('id', assignmentId)
    .single()

  if (error || !data) return { ok: false, status: 404, error: 'Assignment not found' }
  const row = data as unknown as RetryAssignmentRow & { cleaner_profile_id: string }

  if (row.payout_status !== 'FAILED') {
    return { ok: false, status: 409, error: `Payout is ${row.payout_status}, not FAILED — nothing to retry` }
  }
  if (!row.cleaner_payout_eur || row.cleaner_payout_eur <= 0) {
    return { ok: false, status: 409, error: 'No payout amount recorded for this assignment' }
  }

  const cleanerProfile = one(row.cleaner_profiles)
  if (!cleanerProfile?.stripe_connect_payouts_enabled || !cleanerProfile.stripe_connect_account_id) {
    return { ok: false, status: 409, error: "Cleaner's Stripe Connect account isn't ready to receive payouts" }
  }

  try {
    const stripe = getStripe()
    const transfer = await stripe.transfers.create({
      amount:          Math.round(row.cleaner_payout_eur * 100),
      currency:        'eur',
      destination:     cleanerProfile.stripe_connect_account_id,
      transfer_group:  `booking_${row.booking_id}`,
    }, {
      idempotencyKey: `payout-${row.booking_id}-${row.cleaner_profile_id}`,
    })

    await supabase.from('booking_assignments')
      .update({ payout_status: 'PAID', stripe_transfer_id: transfer.id, paid_out_at: new Date().toISOString() })
      .eq('id', row.id)

    return { ok: true }
  } catch (transferErr) {
    console.error(`Payout retry failed (assignment ${row.id}):`, transferErr)
    const message = transferErr instanceof Stripe.errors.StripeError ? transferErr.message : 'Transfer failed'
    return { ok: false, status: 502, error: message }
  }
}

// Scans every payment whose payout is still owed and releases whatever is
// actually ready — called from the cron (src/app/api/cron/release-payouts)
// and lazily wherever a cleaner or admin might be looking at payout state,
// same two-pronged pattern as the dispute auto-resolve job.
export async function releaseDuePayouts(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .select(CANDIDATE_SELECT)
    .in('payout_status', ['PENDING', 'BLOCKED'])

  if (error) {
    console.error('releaseDuePayouts fetch error:', error)
    return 0
  }

  const candidates = (data ?? []) as unknown as PayoutCandidateRow[]
  for (const row of candidates) {
    await processOneCandidate(supabase, row)
  }

  const { data: assignmentData, error: assignmentError } = await supabase
    .from('booking_assignments')
    .select(ASSIGNMENT_CANDIDATE_SELECT)
    .in('payout_status', ['PENDING', 'BLOCKED'])

  if (assignmentError) {
    console.error('releaseDuePayouts (booking_assignments) fetch error:', assignmentError)
    return candidates.length
  }

  const assignmentCandidates = (assignmentData ?? []) as unknown as AssignmentCandidateRow[]
  for (const row of assignmentCandidates) {
    await processOneAssignmentCandidate(supabase, row)
  }

  return candidates.length + assignmentCandidates.length
}

// Scoped to one cleaner — called from the account.updated webhook the
// moment their Connect onboarding completes, so a payout that's been
// sitting BLOCKED doesn't wait for the next cron tick to actually move.
export async function releaseBlockedPayoutsForCleaner(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string
): Promise<number> {
  const { data: bookingIds } = await supabase
    .from('bookings')
    .select('id')
    .eq('cleaner_profile_id', cleanerProfileId)

  const ids = ((bookingIds ?? []) as { id: string }[]).map(b => b.id)

  let releasedCount = 0

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('payments')
      .select(CANDIDATE_SELECT)
      .eq('payout_status', 'BLOCKED')
      .in('booking_id', ids)

    if (error) {
      console.error('releaseBlockedPayoutsForCleaner fetch error:', error)
    } else {
      const candidates = (data ?? []) as unknown as PayoutCandidateRow[]
      for (const row of candidates) {
        await processOneCandidate(supabase, row)
      }
      releasedCount += candidates.length
    }
  }

  // This cleaner's share of any multi-cleaner bookings they're assigned to
  // — found via booking_assignments directly, not the bookings query above
  // (bookings.cleaner_profile_id is null for those).
  const { data: assignmentData, error: assignmentError } = await supabase
    .from('booking_assignments')
    .select(ASSIGNMENT_CANDIDATE_SELECT)
    .eq('cleaner_profile_id', cleanerProfileId)
    .eq('payout_status', 'BLOCKED')

  if (assignmentError) {
    console.error('releaseBlockedPayoutsForCleaner (booking_assignments) fetch error:', assignmentError)
    return releasedCount
  }

  const assignmentCandidates = (assignmentData ?? []) as unknown as AssignmentCandidateRow[]
  for (const row of assignmentCandidates) {
    await processOneAssignmentCandidate(supabase, row)
  }

  return releasedCount + assignmentCandidates.length
}
