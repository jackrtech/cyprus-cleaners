import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, customer_id, status')
    .eq('id', params.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  if (booking.customer_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Only a completed booking has a review prompt to skip' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({ review_skipped_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, review_skipped_at')
    .single()

  if (updateError || !updated) {
    console.error('POST skip-review error:', updateError)
    return NextResponse.json({ error: 'Failed to skip review' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
