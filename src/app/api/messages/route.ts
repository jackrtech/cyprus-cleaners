import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

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
    .select('id, introduction_id, sender_id, body, read_at, created_at')
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

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { introduction_id, body: messageBody } = await req.json()

  if (!introduction_id || typeof introduction_id !== 'string') {
    return NextResponse.json({ error: 'introduction_id is required' }, { status: 400 })
  }
  if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length === 0) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  }
  if (messageBody.length > 2000) {
    return NextResponse.json({ error: 'Message must be 2000 characters or fewer' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const participant = await isParticipant(supabase, introduction_id, session.user.id)
  if (!participant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      introduction_id,
      sender_id: session.user.id,
      body:      messageBody.trim(),
    })
    .select('id, introduction_id, sender_id, body, read_at, created_at')
    .single()

  if (error || !data) {
    console.error('POST message error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
