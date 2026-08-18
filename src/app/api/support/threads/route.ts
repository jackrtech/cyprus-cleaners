import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

interface LastMessage {
  body:         string | null
  photo_path:   string | null
  system_event: string | null
  created_at:   string
}

// Same batching pattern as attachLastMessages in /api/introductions — one
// query for the most recent message per thread instead of N+1.
async function attachLastMessages<T extends { id: string }>(
  supabase: ReturnType<typeof createAdminClient>,
  threads: T[],
  currentUserId: string
): Promise<(T & { last_message: LastMessage | null; has_unread: boolean })[]> {
  if (threads.length === 0) return []

  const { data: recentMessages } = await supabase
    .from('messages')
    .select('support_thread_id, body, photo_path, system_event, created_at, sender_id, read_at')
    .in('support_thread_id', threads.map(t => t.id))
    .order('created_at', { ascending: false })

  const lastByThread = new Map<string, LastMessage>()
  const unreadThreadIds = new Set<string>()
  for (const m of recentMessages ?? []) {
    if (!lastByThread.has(m.support_thread_id)) {
      lastByThread.set(m.support_thread_id, { body: m.body, photo_path: m.photo_path, system_event: m.system_event, created_at: m.created_at })
    }
    if (m.read_at === null && m.sender_id !== currentUserId) {
      unreadThreadIds.add(m.support_thread_id)
    }
  }

  return threads.map(t => ({
    ...t,
    last_message: lastByThread.get(t.id) ?? null,
    has_unread:   unreadThreadIds.has(t.id),
  }))
}

// Find-or-create the caller's own open support thread — a customer or
// cleaner starting a conversation with admin. Idempotent, same shape as
// POST /api/introductions.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Admins respond to support threads, not open their own' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('support_threads')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ id: existing.id }, { status: 200 })
  }

  const { data, error } = await supabase
    .from('support_threads')
    .insert({ user_id: session.user.id })
    .select('id')
    .single()

  if (error || !data) {
    console.error('Support thread insert error:', error)
    return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

// The caller's own threads (customer/cleaner), or every thread (admin) —
// enriched with the most recent message for the inbox list.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  if (session.user.role !== 'ADMIN') {
    const { data, error } = await supabase
      .from('support_threads')
      .select('id, status, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('GET support threads error:', error)
      return NextResponse.json({ error: 'Failed to fetch support threads' }, { status: 500 })
    }
    return NextResponse.json(await attachLastMessages(supabase, data ?? [], session.user.id))
  }

  const { data, error } = await supabase
    .from('support_threads')
    .select('id, status, created_at, users ( full_name, email, role )')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET support threads (ADMIN) error:', error)
    return NextResponse.json({ error: 'Failed to fetch support threads' }, { status: 500 })
  }
  return NextResponse.json(await attachLastMessages(supabase, data ?? [], session.user.id))
}
