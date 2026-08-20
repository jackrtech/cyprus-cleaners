import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const WEEKS = 12

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
}
interface CleanerRow {
  id:            string
  status:        string
  avg_rating:    number
  review_count:  number
  total_jobs_count: number
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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const [bookingsRes, paymentsRes, disputesRes, cleanersRes, customerCountRes] = await Promise.all([
    supabase.from('bookings').select('id, customer_id, status, created_at'),
    supabase.from('payments').select('booking_id, amount_eur, platform_fee_eur, refunded_amount_eur, status, created_at'),
    supabase.from('disputes').select('status, auto_resolved, customer_id, cleaner_profile_id'),
    supabase.from('cleaner_profiles').select('id, status, avg_rating, review_count, total_jobs_count'),
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

  const activeCleaners = cleaners.filter(c => c.status === 'ACTIVE').length

  // Repeat-customer rate: of customers with at least one COMPLETED booking,
  // what fraction have two or more.
  const completedByCustomer = new Map<string, number>()
  for (const b of completedBookings) {
    completedByCustomer.set(b.customer_id, (completedByCustomer.get(b.customer_id) ?? 0) + 1)
  }
  const customersWithCompleted = completedByCustomer.size
  const repeatCustomers = [...completedByCustomer.values()].filter(n => n >= 2).length
  const repeatCustomerRatePct = customersWithCompleted > 0 ? Math.round((repeatCustomers / customersWithCompleted) * 1000) / 10 : 0

  // Dispute rate is only meaningful against completed jobs — a dispute can
  // only be filed on a COMPLETED booking in the first place.
  const disputeRatePct = completedBookings.length > 0 ? Math.round((disputes.length / completedBookings.length) * 1000) / 10 : 0

  const resolvedDisputes = disputes.filter(d => d.status === 'RESOLVED')
  const autoResolveRatePct = resolvedDisputes.length > 0
    ? Math.round((resolvedDisputes.filter(d => d.auto_resolved).length / resolvedDisputes.length) * 1000) / 10
    : null

  // Last WEEKS Monday-anchored weeks, oldest first, zero-filled so the chart
  // never has gaps.
  const weekKeys: string[] = []
  const now = new Date()
  for (let i = WEEKS - 1; i >= 0; i--) {
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
  // Booking frequency: reuses completedByCustomer (already built for the
  // repeat-customer rate above) so this can't drift from that number.
  let oneTimeCustomers = 0, occasionalCustomers = 0, regularCustomers = 0
  for (const count of completedByCustomer.values()) {
    if (count === 1) oneTimeCustomers++
    else if (count <= 4) occasionalCustomers++
    else regularCustomers++
  }

  // Dispute/refund history: every customer with a booking who's never had a
  // dispute falls into "none" -- this reuses the same per-customer dispute
  // counting GET /api/admin/users already does inline per row, just rolled
  // up into cohort counts here instead of shown per customer.
  const disputeCountByCustomer = new Map<string, number>()
  for (const d of disputes) {
    disputeCountByCustomer.set(d.customer_id, (disputeCountByCustomer.get(d.customer_id) ?? 0) + 1)
  }
  let customersWithNoDisputes = 0, customersWithOneDispute = 0, customersWithTwoPlusDisputes = 0
  for (const count of disputeCountByCustomer.values()) {
    if (count === 1) customersWithOneDispute++
    else customersWithTwoPlusDisputes++
  }
  // Everyone else who's ever booked (completed or not) and was never
  // disputed -- distinct customer_ids across all bookings, not just
  // completed ones, since a dispute-free history includes customers whose
  // booking is still pending/confirmed.
  const allBookingCustomerIds = new Set(bookings.map(b => b.customer_id))
  customersWithNoDisputes = [...allBookingCustomerIds].filter(id => !disputeCountByCustomer.has(id)).length

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
    totals: {
      totalBookings:     bookings.length,
      completedBookings: completedBookings.length,
      cancelledBookings: cancelledBookings.length,
      totalCustomers:    customerCountRes.count ?? 0,
      activeCleaners,
      revenueEur:        Math.round(revenueEur * 100) / 100,
    },
    repeatCustomerRatePct,
    disputeRatePct,
    autoResolveRatePct,
    weekly: [...weekly.values()],
    customerSegments: {
      byFrequency: { oneTime: oneTimeCustomers, occasional: occasionalCustomers, regular: regularCustomers },
      byDisputeHistory: { none: customersWithNoDisputes, one: customersWithOneDispute, twoPlus: customersWithTwoPlusDisputes },
    },
    cleanerSegments: {
      byRating,
      byCompletedJobs,
      byDisputeRate,
    },
  })
}
