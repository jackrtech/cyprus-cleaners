import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendNewMessageEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

type AdminClient = ReturnType<typeof createAdminClient>

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024
const SIGNED_URL_TTL = 60 * 60 // 1 hour

async function isParticipant(supabase: AdminClient, introductionId: string, userId: string) {
  const { data: intro } = await supabase
    .from('introductions')
    .select('customer_id, cleaner_profile_id')
    .eq('id', introductionId)
    .single()

  if (!intro) return false
  if (intro.customer_id === userId) return true

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('user_id')
    .eq('id', intro.cleaner_profile_id)
    .single()

  return profile?.user_id === userId
}

// chat-photos is a private bucket — display URLs are signed and regenerated
// on every fetch rather than stored, matching the booking-photos pattern.
async function signPhotoUrls<T extends { id: string; photo_path: string | null }>(
  supabase: AdminClient,
  rows: T[]
): Promise<(T & { photo_url: string | null })[]> {
  const paths = rows.map(r => r.photo_path).filter((p): p is string => !!p)
  if (paths.length === 0) return rows.map(r => ({ ...r, photo_url: null }))

  const { data: signed } = await supabase.storage
    .from('chat-photos')
    .createSignedUrls(paths, SIGNED_URL_TTL)

  const urlByPath = new Map<string, string>(
    (signed ?? []).map((s: { path: string; signedUrl: string }): [string, string] => [s.path, s.signedUrl])
  )

  return rows.map(r => ({
    ...r,
    photo_url: r.photo_path ? urlByPath.get(r.photo_path) ?? null : null,
  }))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const introductionId = req.nextUrl.searchParams.get('introduction_id')
  if (!introductionId) {
    return NextResponse.json({ error: 'introduction_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const participant = await isParticipant(supabase, introductionId, session.user.id)
  if (!participant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('messages')
    .select('id, introduction_id, sender_id, body, photo_path, read_at, created_at')
    .eq('introduction_id', introductionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('GET messages error:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('introduction_id', introductionId)
    .neq('sender_id', session.user.id)
    .is('read_at', null)

  return NextResponse.json(await signPhotoUrls(supabase, data))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = req.headers.get('content-type') ?? ''

  let introduction_id: string
  let messageBody: string
  let photoFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    introduction_id = String(formData.get('introduction_id') ?? '')
    messageBody = String(formData.get('body') ?? '').trim()
    const file = formData.get('photo')
    if (file instanceof File && file.size > 0) photoFile = file
  } else {
    const json = await req.json()
    introduction_id = json.introduction_id
    messageBody = typeof json.body === 'string' ? json.body.trim() : ''
  }

  if (!introduction_id || typeof introduction_id !== 'string') {
    return NextResponse.json({ error: 'introduction_id is required' }, { status: 400 })
  }
  if (!photoFile && messageBody.length === 0) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  }
  if (messageBody.length > 2000) {
    return NextResponse.json({ error: 'Message must be 2000 characters or fewer' }, { status: 400 })
  }
  if (photoFile) {
    if (!ALLOWED_TYPES.has(photoFile.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' }, { status: 400 })
    }
    if (photoFile.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 })
    }
  }

  const supabase = createAdminClient()

  const participant = await isParticipant(supabase, introduction_id, session.user.id)
  if (!participant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let photo_path: string | null = null
  if (photoFile) {
    const ext  = photoFile.type === 'image/png' ? 'png' : photoFile.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${introduction_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const arrayBuffer = await photoFile.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('chat-photos')
      .upload(path, arrayBuffer, { contentType: photoFile.type })

    if (uploadError) {
      console.error('Chat photo upload error:', uploadError)
      return NextResponse.json({ error: 'Photo upload failed' }, { status: 500 })
    }
    photo_path = path
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      introduction_id,
      sender_id: session.user.id,
      body:      messageBody.length > 0 ? messageBody : null,
      photo_path,
    })
    .select('id, introduction_id, sender_id, body, photo_path, read_at, created_at')
    .single()

  if (error || !data) {
    console.error('POST message error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  // First-message-in-thread notification — one-time "you have a new
  // conversation" email, not a per-message notification. Non-blocking,
  // errors are swallowed.
  try {
    const { data: intro } = await supabase
      .from('introductions')
      .select('customer_id, cleaner_profile_id, last_emailed_at')
      .eq('id', introduction_id)
      .single()

    if (intro && !intro.last_emailed_at) {
      const recipientIsCleaner = session.user.id === intro.customer_id
      let recipientEmail: string | null = null
      let dashboardUrl = ''

      if (recipientIsCleaner) {
        const { data: cleanerProfile } = await supabase
          .from('cleaner_profiles')
          .select('user_id')
          .eq('id', intro.cleaner_profile_id)
          .single()
        if (cleanerProfile) {
          const { data: cleanerUser } = await supabase
            .from('users')
            .select('email')
            .eq('id', cleanerProfile.user_id)
            .single()
          recipientEmail = cleanerUser?.email ?? null
        }
        dashboardUrl = `${BASE_URL}/dashboard/cleaner`
      } else {
        const { data: customerUser } = await supabase
          .from('users')
          .select('email')
          .eq('id', intro.customer_id)
          .single()
        recipientEmail = customerUser?.email ?? null
        dashboardUrl = `${BASE_URL}/dashboard`
      }

      if (recipientEmail) {
        await sendNewMessageEmail({
          recipientEmail,
          recipientLocale: null, // locale not stored in users table — defaults to EN
          senderName:      session.user.name ?? session.user.email,
          message:         messageBody.length > 0 ? messageBody : '📷 Photo',
          dashboardUrl,
        })

        await supabase
          .from('introductions')
          .update({ last_emailed_at: new Date().toISOString() })
          .eq('id', introduction_id)
      }
    }
  } catch (emailErr) {
    console.error('Email send error (new message):', emailErr)
  }

  const [signed] = await signPhotoUrls(supabase, [data])
  return NextResponse.json(signed, { status: 201 })
}
