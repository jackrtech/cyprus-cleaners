import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['ACTIVE', 'PAUSED', 'SUSPENDED'] as const
type CleanerStatus = typeof VALID_STATUSES[number]

// { id } is the user id (not the cleaner_profile id) — matches the shape
// GET /api/admin/users lists rows by.
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
  const cleaner_status: CleanerStatus = body.cleaner_status

  if (!VALID_STATUSES.includes(cleaner_status)) {
    return NextResponse.json(
      { error: `cleaner_status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', params.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'This user has no cleaner profile' }, { status: 404 })
  }

  // Pausing/suspending takes effect immediately for new bookings — both
  // cleaner_profiles_public_read (RLS) and GET /api/cleaners/[slug] only
  // ever surface status = 'ACTIVE' profiles. It does NOT touch any booking
  // already in flight — see FLOWS.md §10, that's a deliberate scope
  // boundary here, not an oversight.
  const { data, error } = await supabase
    .from('cleaner_profiles')
    .update({ status: cleaner_status })
    .eq('id', profile.id)
    .select('id, status')
    .single()

  if (error || !data) {
    console.error('PATCH admin user (cleaner_status) error:', error)
    return NextResponse.json({ error: 'Failed to update cleaner status' }, { status: 500 })
  }

  return NextResponse.json(data)
}
