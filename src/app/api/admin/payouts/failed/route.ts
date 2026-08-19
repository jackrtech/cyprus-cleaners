import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Every payout stuck at FAILED — single-cleaner (payments) and multi-cleaner
// (booking_assignments) both, for the admin retry screen. releaseDuePayouts
// never re-scans FAILED on its own (see src/lib/payouts.ts), so this is the
// only way these surface without someone checking Stripe/logs directly.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const [{ data: payments, error: paymentsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase
      .from('payments')
      .select(`
        id, booking_id, cleaner_payout_eur,
        booking:bookings ( id, date, cleaner_profiles ( id, display_name ) )
      `)
      .eq('payout_status', 'FAILED')
      .order('booking_id', { ascending: true }),
    supabase
      .from('booking_assignments')
      .select(`
        id, booking_id, cleaner_payout_eur,
        booking:bookings ( id, date ),
        cleaner_profiles ( id, display_name )
      `)
      .eq('payout_status', 'FAILED')
      .order('booking_id', { ascending: true }),
  ])

  if (paymentsError || assignmentsError) {
    console.error('GET admin payouts/failed error:', paymentsError, assignmentsError)
    return NextResponse.json({ error: 'Failed to fetch failed payouts' }, { status: 500 })
  }

  return NextResponse.json({
    payments: payments ?? [],
    assignments: assignments ?? [],
  })
}
