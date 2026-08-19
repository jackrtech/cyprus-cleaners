import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Completed multi-cleaner bookings, for the admin no-show marking screen
// (stage 5 of the multi-cleaner plan — see FLOWS.md §11). Only COMPLETED
// bookings are relevant here: no-show is something you note after the job
// happened, not something to pre-flag on a booking still in progress.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, date, start_time, duration_hours, address,
      customer:users!bookings_customer_id_fkey ( id, full_name ),
      booking_assignments ( id, cleaner_profile_id, tier_rate_eur, payout_status, no_show, cleaner_profiles ( id, display_name ) )
    `)
    .is('cleaner_profile_id', null)
    .eq('status', 'COMPLETED')
    .order('date', { ascending: false })

  if (error) {
    console.error('GET admin team-bookings error:', error)
    return NextResponse.json({ error: 'Failed to fetch team bookings' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
