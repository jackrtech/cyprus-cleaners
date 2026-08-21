import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Weekly-chart range control, added 2026-08-21 (Todoist) — the charts were
// hardcoded to a fixed 12-week window with no way to change it. Presets
// only (no raw date picker), per the task's own steer that presets are
// better UX for an admin glancing at trends than a custom range.
type RangeKey = '4w' | '12w' | '6m' | 'all'
const RANGE_WEEKS: Record<Exclude<RangeKey, 'all'>, number> = { '4w': 4, '12w': 12, '6m': 26 }
function parseRange(v: string | null): RangeKey {
  return v === '4w' || v === '6m' || v === 'all' ? v : '12w'
}

// "Active cleaner" REDESIGN, 2026-08-21 (Todoist): was a snapshot of
// cleaner_profiles.status = 'ACTIVE' alone — no recency signal at all, just
// "not paused/suspended". Now also requires a login within this window,
// backed by users.last_login_at (added this same pass, stamped in
// NextAuth's authorize()). Both conditions apply — a recently-logged-in but
// PAUSED/SUSPENDED cleaner still doesn't count.
const ACTIVE_CLEANER_WINDOW_DAYS = 30

interface BookingRow {
  id:          string
  customer_id: string
  status:      string
  created_at:  string
}
interface PaymentRow {
  booking_id:          string
  amount_eur:          number
  platform_fee_eur:    number | null
  refunded_amount_eur: number | null
  status:              string
  created_at:          string
}
interface DisputeRow {
  status:             string
  auto_resolved:      boolean
  customer_id:        string
  cleaner_profile_id: string | null
  refund_percentage:  number
}
interface CleanerRow {
  id:            string
  status:        string
  avg_rating:    number
  review_count:  number
  total_jobs_count: number
  users:         { last_login_at: string | null } | null
}

// Monday-anchored week-start key, UTC, so bucketing is stable regardless of
// server timezone.
function weekStartKey(iso: string): string {
  const d = new Date(iso)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const range = parseRange(new URL(request.url).searchParams.get('range'))

  const supabase = createAdminClient()

  const [bookingsRes, paymentsRes, disputesRes, cleanersRes, customerCountRes] = await Promise.all([
    supabase.from('bookings').select('id, customer_id, status, created_at'),
    supabase.from('payments').select('booking_id, amount_eur, platform_fee_eur, refunded_amount_eur, status, created_at'),
    supabase.from('disputes').select('status, auto_resolved, customer_id, cleaner_profile_id, refund_percentage'),
    supabase.from('cleaner_profiles').select('id, status, avg_rating, review_count, total_jobs_count, users(last_login_at)'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'CUSTOMER'),
  ])

  if (bookingsRes.error || paymentsRes.error || disputesRes.error || cleanersRes.error || customerCountRes.error) {
    console.error('GET admin analytics error:', bookingsRes.error ?? paymentsRes.error ?? disputesRes.error ?? cleanersRes.error ?? customerCountRes.error)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }

  const bookings  = (bookingsRes.data ?? []) as BookingRow[]
  const payments  = (paymentsRes.data ?? []) as PaymentRow[]
  const disputes  = (disputesRes.data ?? []) as DisputeRow[]
  const cleaners  = (cleanersRes.data ?? []) as CleanerRow[]

  const completedBookings = bookings.filter(b => b.status === 'COMPLETED')
  const cancelledBookings = bookings.filter(b => b.status === 'CANCELLED')

  // ─── Bookings funnel — REDESIGN 2026-08-21 (Todoist) ──────────────────
  // Replaces the single "Total bookings" number, which conflated every
  // status into one figure. "Accepted" is an approximation: there's no
  // confirmed_at timestamp or status-history table, only current status —
  // so a booking that was confirmed and LATER cancelled is indistinguishable
  // from one cancelled while still REQUESTED, and both fall out of this
  // count. A confirmed_at column (mirroring completed_at) would close this
  // gap if the distinction matters; flagged, not built, this pass.
  const requestedCount = bookings.length
  const acceptedCount = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'COMPLETED').length
  const completedCount = completedBookings.length
  const acceptedOfRequestedPct = requestedCount > 0 ? Math.round((acceptedCount / requestedCount) * 1000) / 10 : 0
  const completedOfAcceptedPct = acceptedCount > 0 ? Math.round((completedCount / acceptedCount) * 1000) / 10 : 0

  // Revenue = the platform's own cut, recognized when the charge succeeds,
  // net of whatever fraction of the charge has actually been refunded —
  // NOT gated on status === 'PAID' alone. A payment that's had a PARTIAL
  // refund (an UNRESOLVABLE dispute split, a no-show redirect/split, etc.)
  // still has status 'REFUNDED' the moment any refund lands, so gating on
  // status alone excluded the entire platform_fee_eur for a booking that
  // only gave a fraction of it back — fixed 2026-08-20, see
  // payments.refunded_amount_eur. A payment that's never been charged
  // (PENDING/FAILED) contributes nothing; REFUND_FAILED still counts in
  // full since the refund attempt never actually moved the money.
  function netPlatformFeeEur(p: PaymentRow): number {
    if (!['PAID', 'REFUNDED', 'REFUND_FAILED'].includes(p.status)) return 0
    const fee = p.platform_fee_eur ?? 0
    if (fee <= 0 || p.amount_eur <= 0) return fee
    const refundedFraction = Math.min(1, (p.refunded_amount_eur ?? 0) / p.amount_eur)
    return Math.max(0, fee * (1 - refundedFraction))
  }
  const revenueEur = payments.reduce((sum, p) => sum + netPlatformFeeEur(p), 0)

  const activeCleanerCutoff = Date.now() - ACTIVE_CLEANER_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const activeCleaners = cleaners.filter(c => {
    if (c.status !== 'ACTIVE') return false
    const lastLogin = c.users?.last_login_at
    return !!lastLogin && new Date(lastLogin).getTime() >= activeCleanerCutoff
  }).length

  // Per-customer completed-booking count — backs both the booking-frequency
  // cohorts below and (via its .size) the "no completed bookings" band.
  const completedByCustomer = new Map<string, number>()
  for (const b of completedBookings) {
    completedByCustomer.set(b.customer_id, (completedByCustomer.get(b.customer_id) ?? 0) + 1)
  }
  const customersWithCompleted = completedByCustomer.size

  // Dispute rate is only meaningful against completed jobs — a dispute can
  // only be filed on a COMPLETED booking in the first place.
  const disputeRatePct = completedBookings.length > 0 ? Math.round((disputes.length / completedBookings.length) * 1000) / 10 : 0

  const resolvedDisputes = disputes.filter(d => d.status === 'RESOLVED')
  const autoResolveRatePct = resolvedDisputes.length > 0
    ? Math.round((resolvedDisputes.filter(d => d.auto_resolved).length / resolvedDisputes.length) * 1000) / 10
    : null

  // Last N Monday-anchored weeks, oldest first, zero-filled so the chart
  // never has gaps. N is fixed for the 4w/12w/6m presets; for 'all' it's
  // derived from the earliest booking/payment actually on record, computed
  // from the rows already fetched above rather than a separate query.
  const now = new Date()
  let weeksCount: number
  if (range === 'all') {
    const allTimestamps = [...bookings.map(b => b.created_at), ...payments.map(p => p.created_at)]
    if (allTimestamps.length === 0) {
      weeksCount = 1
    } else {
      const earliestMs = Math.min(...allTimestamps.map(t => new Date(t).getTime()))
      const earliestKey = weekStartKey(new Date(earliestMs).toISOString())
      const nowKey = weekStartKey(now.toISOString())
      const diffWeeks = Math.round((new Date(nowKey).getTime() - new Date(earliestKey).getTime()) / (7 * 24 * 60 * 60 * 1000))
      weeksCount = diffWeeks + 1
    }
  } else {
    weeksCount = RANGE_WEEKS[range]
  }
  const weekKeys: string[] = []
  for (let i = weeksCount - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i * 7)
    weekKeys.push(weekStartKey(d.toISOString()))
  }
  const weekly = new Map(weekKeys.map(k => [k, { weekStart: k, bookings: 0, revenueEur: 0 }]))
  const earliestWeek = weekKeys[0]

  for (const b of bookings) {
    const key = weekStartKey(b.created_at)
    if (key < earliestWeek) continue
    const bucket = weekly.get(key)
    if (bucket) bucket.bookings += 1
  }
  for (const p of payments) {
    const key = weekStartKey(p.created_at)
    if (key < earliestWeek) continue
    const bucket = weekly.get(key)
    if (bucket) bucket.revenueEur += netPlatformFeeEur(p)
  }

  // ─── Customer segmentation ──────────────────────────────────────────────
  // Booking frequency — REDESIGN 2026-08-21 (Todoist): replaces the single
  // blended "repeat-customer rate %" with the full cohort distribution,
  // including customers with zero completed bookings (previously excluded
  // from every bucket, and from the rate's own denominator). Basis is
  // COMPLETED bookings only, same as before, so this can't disagree with
  // itself if the rate is ever reintroduced elsewhere.
  const totalCustomers = customerCountRes.count ?? 0
  const noCompletedBookingsCustomers = Math.max(0, totalCustomers - customersWithCompleted)
  let oneTimeCustomers = 0, occasionalCustomers = 0, regularCustomers = 0
  for (const count of completedByCustomer.values()) {
    if (count === 1) oneTimeCustomers++
    else if (count <= 4) occasionalCustomers++
    else regularCustomers++
  }

  // Dispute OUTCOME, not just filed count (fixed 2026-08-21 — see AUDIT
  // finding #13: the old "filed count" version made a customer who filed
  // and lost 2 disputes look identical to one who filed and won 2). "Won" =
  // resolved with refund_percentage > 0 — a full CUSTOMER ruling (100%) or
  // a partial UNRESOLVABLE split both count, since both actually moved
  // money in the customer's favor; a CLEANER ruling (0%) or a still-OPEN
  // dispute does not.
  const disputesByCustomer = new Map<string, DisputeRow[]>()
  for (const d of disputes) {
    const arr = disputesByCustomer.get(d.customer_id)
    if (arr) arr.push(d)
    else disputesByCustomer.set(d.customer_id, [d])
  }
  // Distinct customer_ids across ALL bookings, not just completed ones,
  // since a dispute-free history includes customers whose booking is still
  // pending/confirmed.
  const allBookingCustomerIds = new Set(bookings.map(b => b.customer_id))
  let customersWithNoDisputes = 0, customersFiledNoneWon = 0, customersWonAtLeastOne = 0
  for (const custId of allBookingCustomerIds) {
    const custDisputes = disputesByCustomer.get(custId)
    if (!custDisputes || custDisputes.length === 0) { customersWithNoDisputes++; continue }
    const wonAny = custDisputes.some(d => d.status === 'RESOLVED' && d.refund_percentage > 0)
    if (wonAny) customersWonAtLeastOne++
    else customersFiledNoneWon++
  }

  // ─── Cleaner segmentation ───────────────────────────────────────────────
  const activeCleanerRows = cleaners.filter(c => c.status === 'ACTIVE')

  const byRating = { noReviewsYet: 0, under3: 0, threeToUnder4: 0, fourToUnder4_5: 0, fourPoint5Plus: 0 }
  for (const c of activeCleanerRows) {
    if (c.review_count === 0) byRating.noReviewsYet++
    else if (c.avg_rating < 3) byRating.under3++
    else if (c.avg_rating < 4) byRating.threeToUnder4++
    else if (c.avg_rating < 4.5) byRating.fourToUnder4_5++
    else byRating.fourPoint5Plus++
  }

  // Bucket boundaries deliberately match the finalized badge milestones
  // (First job, 25, 50, 100, 250) so the two views can't tell a different
  // story about the same cleaner.
  const byCompletedJobs = { zero: 0, oneTo24: 0, twentyFiveTo49: 0, fiftyTo99: 0, hundredTo249: 0, twoFiftyPlus: 0 }
  for (const c of activeCleanerRows) {
    const n = c.total_jobs_count
    if (n === 0) byCompletedJobs.zero++
    else if (n < 25) byCompletedJobs.oneTo24++
    else if (n < 50) byCompletedJobs.twentyFiveTo49++
    else if (n < 100) byCompletedJobs.fiftyTo99++
    else if (n < 250) byCompletedJobs.hundredTo249++
    else byCompletedJobs.twoFiftyPlus++
  }

  // Dispute rate per cleaner = disputes filed against them / their own
  // completed jobs. Single-cleaner bookings only (disputes.cleaner_profile_id
  // is null on a multi-cleaner booking's whole-job dispute -- attributing
  // those to one specific assignee would need dispute_assignment_outcomes,
  // out of scope for this presentation-layer pass).
  const disputeCountByCleaner = new Map<string, number>()
  for (const d of disputes) {
    if (!d.cleaner_profile_id) continue
    disputeCountByCleaner.set(d.cleaner_profile_id, (disputeCountByCleaner.get(d.cleaner_profile_id) ?? 0) + 1)
  }
  const byDisputeRate = { none: 0, low: 0, high: 0, noCompletedJobs: 0 }
  for (const c of activeCleanerRows) {
    if (c.total_jobs_count === 0) { byDisputeRate.noCompletedJobs++; continue }
    const rate = (disputeCountByCleaner.get(c.id) ?? 0) / c.total_jobs_count
    if (rate === 0) byDisputeRate.none++
    else if (rate < 0.1) byDisputeRate.low++
    else byDisputeRate.high++
  }

  return NextResponse.json({
    funnel: {
      requested:              requestedCount,
      accepted:                acceptedCount,
      completed:               completedCount,
      acceptedOfRequestedPct,
      completedOfAcceptedPct,
    },
    totals: {
      cancelledBookings: cancelledBookings.length,
      totalCustomers,
      activeCleaners,
      revenueEur:        Math.round(revenueEur * 100) / 100,
    },
    disputeRatePct,
    autoResolveRatePct,
    range,
    weekly: [...weekly.values()],
    customerSegments: {
      byFrequency: { noneCompleted: noCompletedBookingsCustomers, oneTime: oneTimeCustomers, occasional: occasionalCustomers, regular: regularCustomers },
      byDisputeHistory: { none: customersWithNoDisputes, filedNoneWon: customersFiledNoneWon, wonAtLeastOne: customersWonAtLeastOne },
    },
    cleanerSegments: {
      byRating,
      byCompletedJobs,
      byDisputeRate,
    },
  })
}
