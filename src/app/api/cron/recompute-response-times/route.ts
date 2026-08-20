import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { recomputeAllResponseTimes } from '@/lib/responseTime'

export const dynamic = 'force-dynamic'

// Runs once daily via Vercel Cron (see vercel.json) — no lazy backstop
// unlike the other crons in this app, since there's no single page load
// that's the natural place to recompute EVERY cleaner's stat (unlike
// tenure-milestone badges, which recompute just the viewing cleaner's own
// on their own dashboard load). A day's staleness on a cosmetic response-
// time label is an acceptable tradeoff for not adding latency to chat sends.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const processed = await recomputeAllResponseTimes(supabase)

  return NextResponse.json({ processed })
}
