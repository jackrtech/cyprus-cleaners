import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

interface LastMessage {
  body:         string | null
  photo_path:   string | null
  system_event: string | null
  created_at:   string
}

// Batches a single query for the most recent message per introduction, and
// whether the current user has any unread messages in it — avoids N+1
// queries when enriching a list of introductions for the dashboard.
async function attachLastMessages<T extends { id: string }>(
  supabase: ReturnType<typeof createAdminClient>,
  intros: T[],
  currentUserId: string
): Promise<(T & { last_message: LastMessage | null; has_unread: boolean })[]> {
  if (intros.length === 0) return []

  const { data: recentMessages } = await supabase
    .from('messages')
    .select('introduction_id, body, photo_path, system_event, created_at, sender_id, read_at')
    .in('introduction_id', intros.map(i => i.id))
    .order('created_at', { ascending: false })

  const lastByIntro = new Map<string, LastMessage>()
  const unreadIntroIds = new Set<string>()
  for (const m of recentMessages ?? []) {
    if (!lastByIntro.has(m.introduction_id)) {
      lastByIntro.set(m.introduction_id, { body: m.body, photo_path: m.photo_path, system_event: m.system_event, created_at: m.created_at })
    }
    // Unread = sent by the other party and never opened (GET /api/messages
    // marks the other party's messages read as soon as you open that chat)
    if (m.read_at === null && m.sender_id !== currentUserId) {
      unreadIntroIds.add(m.introduction_id)
    }
  }

  return intros.map(i => ({
    ...i,
    last_message: lastByIntro.get(i.id) ?? null,
    has_unread:   unreadIntroIds.has(i.id),
  }))
}

// Find-or-create a messaging thread between the current customer and a
// cleaner. Idempotent — returns the existing thread if one already exists,
// otherwise creates it. There is no approval gate: threads are open to
// message in as soon as they exist.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const body = await req.json()
  const { cleaner_profile_id: rawProfileId, cleaner_slug } = body

  let cleaner_profile_id: string | undefined = rawProfileId

  // Fallback: resolve cleaner_profile_id from slug if only slug was provided
  if (!cleaner_profile_id && cleaner_slug) {
    const { data: profileBySlug } = await supabase
      .from('cleaner_profiles')
      .select('id')
      .eq('slug', cleaner_slug)
      .single()
    if (profileBySlug) cleaner_profile_id = profileBySlug.id
  }

  if (!cleaner_profile_id) {
    return NextResponse.json({ error: 'cleaner_profile_id is required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('introductions')
    .select('id')
    .eq('customer_id', session.user.id)
    .eq('cleaner_profile_id', cleaner_profile_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ id: existing.id }, { status: 200 })
  }

  const { data, error } = await supabase
    .from('introductions')
    .insert({
      customer_id: session.user.id,
      cleaner_profile_id,
    })
    .select('id')
    .single()

  if (error) {
    // Race: a concurrent request already created this thread (unique
    // customer_id/cleaner_profile_id constraint) — return the winner's row
    // instead of failing.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('introductions')
        .select('id')
        .eq('customer_id', session.user.id)
        .eq('cleaner_profile_id', cleaner_profile_id)
        .single()
      if (raced) return NextResponse.json({ id: raced.id }, { status: 200 })
    }
    console.error('Introduction insert error:', error)
    return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { role, id: userId } = session.user

  if (role === 'CUSTOMER') {
    const { data, error } = await supabase
      .from('introductions')
      .select(`
        id, created_at,
        cleaner_profiles ( id, display_name, photo_url, cities )
      `)
      .eq('customer_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('GET introductions (CUSTOMER) error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch introductions' },
        { status: 500 }
      )
    }
    return NextResponse.json(await attachLastMessages(supabase, data ?? [], userId))
  }

  if (role === 'CLEANER') {
    const { data: profile } = await supabase
      .from('cleaner_profiles')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!profile) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('introductions')
      .select(`
        id, created_at,
        users ( full_name )
      `)
      .eq('cleaner_profile_id', profile.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('GET introductions (CLEANER) error:', error)
      return NextResponse.json({ error: 'Failed to fetch introductions' }, { status: 500 })
    }
    return NextResponse.json(await attachLastMessages(supabase, data ?? [], userId))
  }

  // ADMIN: return everything
  const { data, error } = await supabase
    .from('introductions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET introductions (ADMIN) error:', error)
    return NextResponse.json({ error: 'Failed to fetch introductions' }, { status: 500 })
  }
  return NextResponse.json(data)
}
