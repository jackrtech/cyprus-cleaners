import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { releaseDuePayouts } from '@/lib/payouts'

export const dynamic = 'force-dynamic'

// Runs on a schedule via Vercel Cron (see vercel.json) to transfer any
// cleaner payout whose post-completion hold has cleared — see
// src/lib/payouts.ts. Also invoked lazily at the top of GET
// /api/cleaner-profiles/me/earnings and the admin users list, so a payout
// still shows up-to-date even between cron ticks.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const processed = await releaseDuePayouts(supabase)

  return NextResponse.json({ processed })
}
