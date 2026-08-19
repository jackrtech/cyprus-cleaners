import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { getActiveCleanersForViewer } from '@/lib/cleaners'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)

  try {
    const rows = await getActiveCleanersForViewer(session)
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch cleaners' }, { status: 500 })
  }
}
