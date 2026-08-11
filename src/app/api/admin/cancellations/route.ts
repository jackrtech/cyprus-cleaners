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

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, date, start_time, cancellation_reason, created_at,
      customer:users!bookings_customer_id_fkey ( id, full_name, email ),
      cancelled_by_user:users!bookings_cancelled_by_fkey ( id, full_name, role ),
      cleaner_profiles ( id, display_name, user_id )
    `)
    .eq('status', 'CANCELLED')
    .not('cancellation_reason', 'is', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET admin cancellations error:', error)
    return NextResponse.json({ error: 'Failed to fetch cancellations' }, { status: 500 })
  }

  return NextResponse.json(data)
}
