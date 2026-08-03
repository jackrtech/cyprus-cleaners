import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024
const SIGNED_URL_TTL = 60 * 60 // 1 hour

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('photo')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No photo provided' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, cleaner_profile_id, status, photo_paths')
    .eq('id', params.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data: cleanerProfile } = await supabase
    .from('cleaner_profiles')
    .select('user_id')
    .eq('id', booking.cleaner_profile_id)
    .single()

  if (cleanerProfile?.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (booking.status !== 'CONFIRMED') {
    return NextResponse.json({ error: 'Photos can only be added to a confirmed booking' }, { status: 409 })
  }

  const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${params.id}/${Date.now()}-${booking.photo_paths.length}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('booking-photos')
    .upload(path, arrayBuffer, { contentType: file.type })

  if (uploadError) {
    console.error('Booking photo upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed', detail: uploadError.message }, { status: 500 })
  }

  const photo_paths = [...booking.photo_paths, path]

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ photo_paths })
    .eq('id', params.id)

  if (updateError) {
    console.error('Booking photo_paths update error:', updateError)
    return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 })
  }

  const { data: signedData } = await supabase.storage
    .from('booking-photos')
    .createSignedUrl(path, SIGNED_URL_TTL)

  return NextResponse.json({
    photo_paths,
    new_photo_url: signedData?.signedUrl ?? null,
  }, { status: 201 })
}
