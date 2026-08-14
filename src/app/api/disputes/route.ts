import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendDisputeFiledAlertEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const CLAIM_MAX_LENGTH = 2000

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const booking_id: string = typeof body.booking_id === 'string' ? body.booking_id : ''
  const claim: string = typeof body.claim === 'string' ? body.claim.trim() : ''

  if (!booking_id) {
    return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  }
  if (!claim) {
    return NextResponse.json({ error: 'A claim is required' }, { status: 400 })
  }
  if (claim.length > CLAIM_MAX_LENGTH) {
    return NextResponse.json({ error: `Claim must be ${CLAIM_MAX_LENGTH} characters or fewer` }, { status: 400 })
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
    return NextResponse.json({ error: 'Only a completed booking can be disputed' }, { status: 409 })
  }

  const { data: existing } = await supabase
    .from('disputes')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A dispute has already been filed for this booking' }, { status: 409 })
  }

  const { data: dispute, error: insertError } = await supabase
    .from('disputes')
    .insert({
      booking_id,
      customer_id:        session.user.id,
      cleaner_profile_id: booking.cleaner_profile_id,
      claim,
    })
    .select('*')
    .single()

  // The unique constraint on booking_id is the real guard against a race
  // between two near-simultaneous filings — the pre-check above is just to
  // return a friendlier error in the common (non-racing) case.
  if (insertError?.code === '23505') {
    return NextResponse.json({ error: 'A dispute has already been filed for this booking' }, { status: 409 })
  }
  if (insertError || !dispute) {
    console.error('POST dispute insert error:', insertError)
    return NextResponse.json({ error: 'Failed to file dispute' }, { status: 500 })
  }

  // Notify admin — non-blocking, errors are swallowed
  try {
    const { data: cleanerProfile } = await supabase
      .from('cleaner_profiles')
      .select('display_name')
      .eq('id', booking.cleaner_profile_id)
      .single()

    await sendDisputeFiledAlertEmail({
      bookingId:    booking_id,
      customerName: session.user.name ?? session.user.email,
      cleanerName:  cleanerProfile?.display_name ?? 'Unknown',
      claim,
      adminUrl:     `${BASE_URL}/admin/disputes`,
    })
  } catch (emailErr) {
    console.error('Email send error (dispute filed):', emailErr)
  }

  return NextResponse.json(dispute, { status: 201 })
}
