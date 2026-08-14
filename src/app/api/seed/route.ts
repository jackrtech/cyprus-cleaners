import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Reseeds the three real controlled accounts (see src/scripts/seed-full.js)
// via a preview/dev-only HTTP trigger — spawns the same script `npm run
// seed` runs locally rather than duplicating its logic in two places.
//
// Triple safety net against ever touching production, matching the
// npm run seed script's own account-scoping:
//   1. Hard 403 below if VERCEL_ENV is 'production'
//   2. SEED_SECRET is only ever set in Vercel's Preview/Development env
//      scopes (never Production) — see the Vercel dashboard env var config
//   3. The script itself only ever touches data belonging to the three
//      named accounts; it can't create/modify anyone else's data regardless
//      of which environment it's run in
export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Seeding is disabled in production' }, { status: 403 })
  }

  const auth = req.headers.get('authorization')
  if (!process.env.SEED_SECRET || auth !== `Bearer ${process.env.SEED_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const verification = typeof body.verification === 'string' ? body.verification : null
  const args = [path.join(process.cwd(), 'src/scripts/seed-full.js')]
  if (verification) args.push(`--verification=${verification}`)

  try {
    const { stdout } = await execFileAsync('node', args, { timeout: 45_000 })
    return NextResponse.json({ success: true, message: stdout.trim().split('\n').pop() })
  } catch (err) {
    console.error('Seed route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Seed failed' }, { status: 500 })
  }
}
