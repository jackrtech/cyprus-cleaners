import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { autoResolveOverdueDisputes } from '@/lib/disputes'

export const dynamic = 'force-dynamic'

// Runs on a schedule via Vercel Cron (see vercel.json) to close out any
// dispute that's blown past its 24h resolve_by SLA with the decided
// default (full refund to the customer) — see src/lib/disputes.ts. Also
// invoked lazily at the top of GET /api/admin/disputes so a breach still
// resolves close to real-time the moment an admin opens the queue, even on
// a Vercel plan where cron frequency is capped below 24h.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const resolved = await autoResolveOverdueDisputes(supabase)

  return NextResponse.json({ resolved })
}
