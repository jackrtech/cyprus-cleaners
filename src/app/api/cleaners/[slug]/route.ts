import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { getCleanerProfileForViewer } from '@/lib/cleaners'
import { BOOKING_FEE_EUR } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions)
  const cleaner = await getCleanerProfileForViewer(params.slug, session)

  if (!cleaner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ...cleaner, booking_fee_eur: BOOKING_FEE_EUR })
}
