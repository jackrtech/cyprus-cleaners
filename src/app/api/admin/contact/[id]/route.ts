import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Toggles resolved/unresolved rather than a one-way "resolve" action — an
// admin marking something resolved by mistake needs a way back.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const resolved = body.resolved !== false // default true — the common case is "mark resolved"

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('contact_submissions')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', params.id)
    .select('id, resolved_at')
    .single()

  if (error || !data) {
    console.error('PATCH admin contact submission error:', error)
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
  }

  return NextResponse.json(data)
}
