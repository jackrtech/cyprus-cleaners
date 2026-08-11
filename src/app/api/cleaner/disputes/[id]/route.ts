import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const response: string = typeof body.response === 'string' ? body.response.trim() : ''
  if (!response) {
    return NextResponse.json({ error: 'A response is required' }, { status: 400 })
  }
  if (response.length > 2000) {
    return NextResponse.json({ error: 'Response must be 2000 characters or fewer' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No cleaner profile found for this account' }, { status: 404 })
  }

  const { data: dispute, error: fetchError } = await supabase
    .from('disputes')
    .select('id, cleaner_profile_id, status')
    .eq('id', params.id)
    .single()

  if (fetchError || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
  }
  if (dispute.cleaner_profile_id !== profile.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (dispute.status !== 'OPEN') {
    return NextResponse.json({ error: 'This dispute has already been resolved' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('disputes')
    .update({ cleaner_response: response })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH cleaner dispute response error:', updateError)
    return NextResponse.json({ error: 'Failed to save your response' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
