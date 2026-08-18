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
  booking_id:       string
  platform_fee_eur: number | null
  status:           string
  created_at:       string
}
interface DisputeRow {
  status:        string
  auto_resolved: boolean
}
interface CleanerRow {
  status: string
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
    supabase.from('payments').select('booking_id, platform_fee_eur, status, created_at'),
    supabase.from('disputes').select('status, auto_resolved'),
    supabase.from('cleaner_profiles').select('status'),
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

  // Revenue = the platform's own cut, recognized when the charge succeeds
  // (payments.status === 'PAID') — not gross booking value, and excluding
  // anything since refunded (a refund flips status away from PAID).
  const revenueEur = payments
    .filter(p => p.status === 'PAID')
    .reduce((sum, p) => sum + (p.platform_fee_eur ?? 0), 0)

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
    if (p.status !== 'PAID') continue
    const key = weekStartKey(p.created_at)
    if (key < earliestWeek) continue
    const bucket = weekly.get(key)
    if (bucket) bucket.revenueEur += p.platform_fee_eur ?? 0
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
  })
}
