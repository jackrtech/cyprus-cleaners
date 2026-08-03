import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { booking_id, rating, body: reviewBody } = body

  if (!booking_id || typeof booking_id !== 'string') {
    return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  }
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
  }
  if (reviewBody !== undefined && reviewBody !== null && (typeof reviewBody !== 'string' || reviewBody.length > 1000)) {
    return NextResponse.json({ error: 'Review body must be 1000 characters or fewer' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, customer_id, cleaner_profile_id, status')
    .eq('id', booking_id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  if (booking.customer_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Only a completed booking can be reviewed' }, { status: 409 })
  }

  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This booking already has a review' }, { status: 409 })
  }

  // avg_rating / review_count on cleaner_profiles are updated by the
  // on_review_insert DB trigger — never set them from application code.
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id,
      customer_id:        session.user.id,
      cleaner_profile_id: booking.cleaner_profile_id,
      rating,
      body: reviewBody?.trim() || null,
    })
    .select('id, booking_id, rating, body, created_at')
    .single()

  if (error || !data) {
    console.error('Review insert error:', error)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
