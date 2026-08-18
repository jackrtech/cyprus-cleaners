import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  interface CleanerProfileRow { id: string; status: string; verified: boolean }
  interface UserRow {
    id: string; email: string; full_name: string; role: string
    email_verified: boolean; created_at: string
    cleaner_profiles: CleanerProfileRow | CleanerProfileRow[] | null
  }

  const [{ data, error }, { data: disputeRows, error: disputeError }] = await Promise.all([
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
  ])

  if (error) {
    console.error('GET admin users error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
  if (disputeError) {
    console.error('GET admin users — dispute history error:', disputeError)
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

  // cleaner_profiles is a one-to-one embed (one profile per user) but
  // PostgREST returns it as an array — normalise to a single object or null.
  const rows = ((data ?? []) as unknown as UserRow[]).map(u => ({
    id: u.id, email: u.email, full_name: u.full_name, role: u.role,
    email_verified: u.email_verified, created_at: u.created_at,
    cleaner_profile: Array.isArray(u.cleaner_profiles) ? u.cleaner_profiles[0] ?? null : u.cleaner_profiles,
    dispute_history: disputeStatsByCustomer.get(u.id) ?? null,
  }))

  return NextResponse.json(rows)
}
