import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Admin-only no-show toggle for one cleaner's assignment on a multi-cleaner
// booking (stage 5 of the multi-cleaner plan — see FLOWS.md §11). Lightest
// possible v1: admin-only, no cleaner/customer self-service, no contest
// flow — those are open questions flagged in the original plan.
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
  if (typeof body.no_show !== 'boolean') {
    return NextResponse.json({ error: 'no_show must be a boolean' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: assignment, error: fetchError } = await supabase
    .from('booking_assignments')
    .select('id, payout_status')
    .eq('id', params.id)
    .single()

  if (fetchError || !assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }
  // Once a payout has actually gone out (or definitively failed), flipping
  // no_show retroactively would need a clawback this app doesn't support —
  // only allow the toggle while the payout is still pending.
  if (!['PENDING', 'BLOCKED'].includes(assignment.payout_status)) {
    return NextResponse.json({ error: `Can't change no-show status once payout_status is ${assignment.payout_status}` }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('booking_assignments')
    .update({ no_show: body.no_show })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH admin booking-assignment error:', updateError)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
