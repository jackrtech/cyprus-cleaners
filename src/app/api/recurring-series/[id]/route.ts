import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Ends the whole standing arrangement — either party. Does NOT reach back
// and cancel an already-created upcoming occurrence (that's a normal
// CONFIRMED booking with its own cancel action); this only stops the daily
// cron (/api/cron/charge-recurring) from ever spawning/charging a later
// one. See schema.sql's recurring_series comment.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: series, error: fetchError } = await supabase
    .from('recurring_series')
    .select('id, customer_id, cleaner_profile_id, status, cleaner_profiles ( user_id )')
    .eq('id', params.id)
    .single()

  if (fetchError || !series) {
    return NextResponse.json({ error: 'Recurring series not found' }, { status: 404 })
  }

  const cleanerProfile = Array.isArray(series.cleaner_profiles) ? series.cleaner_profiles[0] : series.cleaner_profiles
  const isCustomer = series.customer_id === session.user.id
  const isCleaner = cleanerProfile?.user_id === session.user.id
  if (!isCustomer && !isCleaner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (series.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'This recurring series is already cancelled' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('recurring_series')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('status', 'ACTIVE')
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH recurring-series cancel error:', updateError)
    return NextResponse.json({ error: 'Failed to cancel this recurring series' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
