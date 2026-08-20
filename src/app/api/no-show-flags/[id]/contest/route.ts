import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const RESPONSE_MAX_LENGTH = 2000

// The flagged cleaner's own contest — distinct from /corroborate, which is
// for the OTHER assigned cleaner(s) on the same job. Re-submittable while
// the flag is still PENDING, same as a dispute's cleaner_response.
export async function POST(
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
  if (response.length > RESPONSE_MAX_LENGTH) {
    return NextResponse.json({ error: `Response must be ${RESPONSE_MAX_LENGTH} characters or fewer` }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No cleaner profile found' }, { status: 403 })
  }

  const { data: flag, error: fetchError } = await supabase
    .from('no_show_flags')
    .select('id, status, assignment_id, booking_assignments!no_show_flags_assignment_id_fkey ( cleaner_profile_id )')
    .eq('id', params.id)
    .single()

  if (fetchError || !flag) {
    return NextResponse.json({ error: 'No-show flag not found' }, { status: 404 })
  }
  if (flag.status !== 'PENDING') {
    return NextResponse.json({ error: 'This no-show flag has already been resolved' }, { status: 409 })
  }

  const assignment = Array.isArray(flag.booking_assignments) ? flag.booking_assignments[0] : flag.booking_assignments
  if (!assignment || assignment.cleaner_profile_id !== profile.id) {
    return NextResponse.json({ error: "You weren't the cleaner flagged on this booking" }, { status: 403 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('no_show_flags')
    .update({ cleaner_response: response, contested_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('POST no-show contest error:', updateError)
    return NextResponse.json({ error: 'Failed to record your response' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
