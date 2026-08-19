import { NextResponse } from 'next/server'
import { getCleanerReviewsBySlug } from '@/lib/cleaners'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  try {
    const reviews = await getCleanerReviewsBySlug(params.slug)
    return NextResponse.json(reviews)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}
