import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { retryFailedAssignmentPayout } from '@/lib/payouts'

// Admin-only manual retry for one cleaner's assignment payout on a
// multi-cleaner booking, stuck at payout_status = 'FAILED'. { id } is
// booking_assignments.id — sibling route to this same resource's PATCH
// (no-show toggle) at [id]/route.ts.
export async function POST(
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

  const supabase = createAdminClient()
  const result = await retryFailedAssignmentPayout(supabase, params.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ status: 'PAID' })
}
