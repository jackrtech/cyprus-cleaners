import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const VALID_ACTIONS = ['APPROVE', 'REJECT'] as const
type Action = typeof VALID_ACTIONS[number]

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

  const body = await req.json()
  const action: Action = body.action

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: profile, error: fetchError } = await supabase
    .from('cleaner_profiles')
    .select('id, id_submitted_at, verified')
    .eq('id', params.id)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json({ error: 'Cleaner profile not found' }, { status: 404 })
  }
  if (!profile.id_submitted_at) {
    return NextResponse.json({ error: 'No verification submission pending for this profile' }, { status: 400 })
  }

  // Reject clears id_submitted_at so the cleaner can resubmit; there's no
  // separate submission flow yet, so this just resets the queue state.
  const update = action === 'APPROVE'
    ? { verified: true }
    : { verified: false, id_submitted_at: null }

  const { error: updateError } = await supabase
    .from('cleaner_profiles')
    .update(update)
    .eq('id', params.id)

  if (updateError) {
    console.error('PATCH admin verification error:', updateError)
    return NextResponse.json({ error: 'Failed to update verification status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
