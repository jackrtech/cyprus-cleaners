import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const VALID_RESPONSES = ['CORROBORATES', 'DISPUTES'] as const

// The OTHER assigned cleaner(s) on the same job weigh in on a pending flag —
// the flagged cleaner's own input goes through /contest instead (see that
// route). Upserts so a cleaner can change their mind while the flag is still
// PENDING, same spirit as the contest route being re-submittable.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const response = body.response
  const note: string | null = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  if (!VALID_RESPONSES.includes(response)) {
    return NextResponse.json({ error: `response must be one of ${VALID_RESPONSES.join(', ')}` }, { status: 400 })
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
    .select('id, status, booking_id, assignment_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !flag) {
    return NextResponse.json({ error: 'No-show flag not found' }, { status: 404 })
  }
  if (flag.status !== 'PENDING') {
    return NextResponse.json({ error: 'This no-show flag has already been resolved' }, { status: 409 })
  }

  // Must be assigned to the same booking, but NOT the flagged assignment —
  // the flagged cleaner responds via /contest instead.
  const { data: myAssignment } = await supabase
    .from('booking_assignments')
    .select('id')
    .eq('booking_id', flag.booking_id)
    .eq('cleaner_profile_id', profile.id)
    .maybeSingle()

  if (!myAssignment) {
    return NextResponse.json({ error: "You aren't assigned to this booking" }, { status: 403 })
  }
  if (myAssignment.id === flag.assignment_id) {
    return NextResponse.json({ error: 'The flagged cleaner should respond via the contest action, not corroboration' }, { status: 400 })
  }

  const { data: corroboration, error: upsertError } = await supabase
    .from('no_show_corroborations')
    .upsert(
      { no_show_flag_id: params.id, cleaner_profile_id: profile.id, response, note },
      { onConflict: 'no_show_flag_id,cleaner_profile_id' }
    )
    .select('*')
    .single()

  if (upsertError || !corroboration) {
    console.error('POST no-show corroborate error:', upsertError)
    return NextResponse.json({ error: 'Failed to record your response' }, { status: 500 })
  }

  return NextResponse.json(corroboration, { status: 201 })
}
