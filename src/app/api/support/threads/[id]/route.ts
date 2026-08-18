import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Admin-only: mark a support thread resolved/reopened. Toggles rather than a
// one-way "close," same reasoning as PATCH /api/admin/contact/[id] — a
// mistaken close needs a way back.
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
  const closed = body.closed !== false // default true — the common case is "mark resolved"

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('support_threads')
    .update({ status: closed ? 'CLOSED' : 'OPEN' })
    .eq('id', params.id)
    .select('id, status')
    .single()

  if (error || !data) {
    console.error('PATCH support thread error:', error)
    return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 })
  }

  return NextResponse.json(data)
}
