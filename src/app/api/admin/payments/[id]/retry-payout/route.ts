import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { retryFailedPayout } from '@/lib/payouts'

// Admin-only manual retry for a single-cleaner booking's payout stuck at
// payout_status = 'FAILED' — see src/lib/payouts.ts's retryFailedPayout for
// why this exists (releaseDuePayouts never re-scans FAILED rows on its own).
// { id } is payments.id, matching the retry-refund route's convention.
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
  const result = await retryFailedPayout(supabase, params.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ status: 'PAID' })
}
