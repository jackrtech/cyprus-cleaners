import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { read_at } = await req.json()
  if (!read_at || typeof read_at !== 'string') {
    return NextResponse.json({ error: 'read_at is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select('id, introduction_id')
    .eq('id', params.id)
    .single()

  if (messageError || !message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const { data: intro } = await supabase
    .from('introductions')
    .select('customer_id, cleaner_profile_id')
    .eq('id', message.introduction_id)
    .single()

  if (!intro) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let participant = intro.customer_id === session.user.id
  if (!participant) {
    const { data: profile } = await supabase
      .from('cleaner_profiles')
      .select('user_id')
      .eq('id', intro.cleaner_profile_id)
      .single()
    participant = profile?.user_id === session.user.id
  }

  if (!participant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ read_at })
    .eq('id', params.id)
    .select('id, introduction_id, sender_id, body, read_at, created_at')
    .single()

  if (error || !data) {
    console.error('PATCH message error:', error)
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }

  return NextResponse.json(data)
}
