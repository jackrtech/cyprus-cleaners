import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { releaseDuePayouts } from '@/lib/payouts'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  // Lazy backstop for the payout-release cron, same pattern as the dispute
  // auto-resolve check — admin looking at this list is a natural moment to
  // also make sure no payout is sitting stale past its release point.
  await releaseDuePayouts(supabase)

  interface CleanerProfileRow { id: string; status: string; verified: boolean }
  interface UserRow {
    id: string; email: string; full_name: string; role: string
    email_verified: boolean; created_at: string
    cleaner_profiles: CleanerProfileRow | CleanerProfileRow[] | null
  }

  const [{ data, error }, { data: disputeRows, error: disputeError }, { data: failedPayoutRows, error: payoutError }] = await Promise.all([
    supabase
      .from('users')
      .select(`
        id, email, full_name, role, email_verified, created_at,
        cleaner_profiles ( id, status, verified )
      `)
      .order('created_at', { ascending: false }),
    // Per-customer dispute/refund pattern — surfaced inline on each
    // customer's card below rather than a separate lookup, so admin sees a
    // repeat-timeout customer without having to go dig for it (that's the
    // whole point: the 24h auto-resolve-to-refund policy is only safe if
    // this pattern stays visible).
    supabase.from('disputes').select('customer_id, status, auto_resolved'),
    // Per-cleaner failed-payout visibility — a FAILED transfer needs manual
    // Stripe-dashboard follow-up (src/lib/payouts.ts); surfaced here rather
    // than only in the admin alert email so it doesn't get lost if that
    // email is missed.
    supabase.from('bookings').select('cleaner_profile_id, payments!inner ( payout_status )').eq('payments.payout_status', 'FAILED'),
  ])

  if (error) {
    console.error('GET admin users error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
  if (disputeError) {
    console.error('GET admin users — dispute history error:', disputeError)
  }
  if (payoutError) {
    console.error('GET admin users — failed payout error:', payoutError)
  }

  interface DisputeStats { total: number; autoResolved: number; adminResolved: number }
  const disputeStatsByCustomer = new Map<string, DisputeStats>()
  for (const d of (disputeRows ?? []) as { customer_id: string; status: string; auto_resolved: boolean }[]) {
    const stats = disputeStatsByCustomer.get(d.customer_id) ?? { total: 0, autoResolved: 0, adminResolved: 0 }
    stats.total += 1
    if (d.auto_resolved) stats.autoResolved += 1
    else if (d.status === 'RESOLVED') stats.adminResolved += 1
    disputeStatsByCustomer.set(d.customer_id, stats)
  }

  const failedPayoutCountByCleanerProfile = new Map<string, number>()
  for (const row of (failedPayoutRows ?? []) as { cleaner_profile_id: string }[]) {
    failedPayoutCountByCleanerProfile.set(row.cleaner_profile_id, (failedPayoutCountByCleanerProfile.get(row.cleaner_profile_id) ?? 0) + 1)
  }

  // cleaner_profiles is a one-to-one embed (one profile per user) but
  // PostgREST returns it as an array — normalise to a single object or null.
  const rows = ((data ?? []) as unknown as UserRow[]).map(u => {
    const cleanerProfile = Array.isArray(u.cleaner_profiles) ? u.cleaner_profiles[0] ?? null : u.cleaner_profiles
    return {
      id: u.id, email: u.email, full_name: u.full_name, role: u.role,
      email_verified: u.email_verified, created_at: u.created_at,
      cleaner_profile: cleanerProfile,
      dispute_history: disputeStatsByCustomer.get(u.id) ?? null,
      failed_payout_count: cleanerProfile ? (failedPayoutCountByCleanerProfile.get(cleanerProfile.id) ?? 0) : 0,
    }
  })

  return NextResponse.json(rows)
}
