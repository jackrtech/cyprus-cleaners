import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAccountDeletedEmail } from '@/lib/email'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('email_verified, role')
    .eq('id', session.user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ email_verified: data.email_verified, role: data.role })
}

// Self-service account deletion (GDPR erasure). Anonymizes rather than hard-
// deletes: bookings/payments/reviews/disputes keep a valid FK so the
// transaction/tax record survives, but every field that's actually
// personally identifying is overwritten or, for cleaner ID documents,
// removed from storage entirely. Blocked while there's unfinished business
// tied to the account — see BLOCKING_* below — since the other party (or an
// open financial issue) needs this account to still exist to resolve.
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const userId = session.user.id

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let cleanerProfile: {
    id: string
    id_photo_url: string | null
    selfie_photo_url: string | null
  } | null = null

  if (user.role === 'CLEANER') {
    const { data: profile } = await supabase
      .from('cleaner_profiles')
      .select('id, id_photo_url, selfie_photo_url')
      .eq('user_id', userId)
      .single()
    cleanerProfile = profile
  }

  // Bookings/disputes are keyed by cleaner_profile_id for a cleaner, by
  // customer_id for a customer — resolve which column to filter on once.
  const bookingsQuery = cleanerProfile
    ? supabase.from('bookings').select('id').eq('cleaner_profile_id', cleanerProfile.id)
    : supabase.from('bookings').select('id').eq('customer_id', userId)
  const { data: ownBookings } = await bookingsQuery
  const ownBookingIds = (ownBookings ?? []).map((b: { id: string }) => b.id)

  const activeBookingQuery = cleanerProfile
    ? supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('cleaner_profile_id', cleanerProfile.id)
    : supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('customer_id', userId)
  const { count: activeBookingCount } = await activeBookingQuery.in('status', ['REQUESTED', 'CONFIRMED'])

  if (activeBookingCount) {
    return NextResponse.json(
      { error: 'ACTIVE_BOOKING', message: 'You have an active or upcoming booking. Please resolve it before deleting your account.' },
      { status: 409 }
    )
  }

  const openDisputeQuery = cleanerProfile
    ? supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('cleaner_profile_id', cleanerProfile.id)
    : supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('customer_id', userId)
  const { count: openDisputeCount } = await openDisputeQuery.eq('status', 'OPEN')

  if (openDisputeCount) {
    return NextResponse.json(
      { error: 'OPEN_DISPUTE', message: 'You have an open dispute. Please wait for it to be resolved before deleting your account.' },
      { status: 409 }
    )
  }

  if (ownBookingIds.length > 0) {
    const { count: failedRefundCount } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('booking_id', ownBookingIds)
      .eq('status', 'REFUND_FAILED')

    if (failedRefundCount) {
      return NextResponse.json(
        { error: 'REFUND_FAILED', message: 'One of your bookings has an unresolved refund issue. Please contact support before deleting your account.' },
        { status: 409 }
      )
    }
  }

  const anonEmail = `deleted-${userId}@deleted.invalid`
  const unusablePasswordHash = await bcrypt.hash(crypto.randomUUID(), 12)

  const { error: updateUserError } = await supabase
    .from('users')
    .update({
      full_name: 'Deleted user',
      email: anonEmail,
      phone: null,
      avatar_url: null,
      stripe_customer_id: null,
      password_hash: unusablePasswordHash,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (updateUserError) {
    console.error('Account deletion — user anonymize error:', updateUserError)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  // Saved addresses are pure PII with no other referrer — bookings snapshot
  // their own copy of whichever address was used (see schema.sql), so
  // deleting these outright doesn't touch any booking record.
  await supabase.from('addresses').delete().eq('user_id', userId)

  if (cleanerProfile) {
    const { error: photoRemoveError } = await supabase.storage
      .from('cleaner-photos')
      .remove([`${userId}/avatar.jpg`, `${userId}/cover.jpg`])
    if (photoRemoveError) console.error('Account deletion — cleaner photo remove error:', photoRemoveError)

    const idPaths = [cleanerProfile.id_photo_url, cleanerProfile.selfie_photo_url].filter((p): p is string => !!p)
    if (idPaths.length > 0) {
      const { error: idRemoveError } = await supabase.storage.from('id-documents').remove(idPaths)
      if (idRemoveError) console.error('Account deletion — ID document remove error:', idRemoveError)
    }

    const { error: updateProfileError } = await supabase
      .from('cleaner_profiles')
      .update({
        display_name: 'Deleted user',
        bio: '',
        bio_el: null,
        photo_url: null,
        cover_photo_url: null,
        id_photo_url: null,
        selfie_photo_url: null,
        verification_note: null,
        status: 'SUSPENDED',
      })
      .eq('id', cleanerProfile.id)

    if (updateProfileError) console.error('Account deletion — cleaner profile anonymize error:', updateProfileError)
  }

  try {
    await sendAccountDeletedEmail({ to: user.email })
  } catch (emailErr) {
    console.error('Account deletion — confirmation email error:', emailErr)
  }

  return NextResponse.json({ ok: true })
}
