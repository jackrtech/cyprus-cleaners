import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select(`
      id, slug, display_name, bio, photo_url, cover_photo_url, city, cities,
      hourly_rate_eur, services, languages, cleaner_type,
      gender, verified, avg_rating, review_count,
      unique_customer_count, total_jobs_count, availability,
      is_mock, is_company, created_at
    `)
    .eq('status', 'ACTIVE')
    .order('avg_rating', { ascending: false })
    .order('review_count', { ascending: false })

  if (error) {
    console.error('GET cleaners error:', error)
    return NextResponse.json({ error: 'Failed to fetch cleaners' }, { status: 500 })
  }

  const rows = (data ?? []) as (Record<string, unknown> & { id: string })[]

  // Public route (no auth required to browse) — favorite state only makes
  // sense once we know who's asking, so it's added on top rather than
  // gating the route itself.
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER' || !rows.length) {
    return NextResponse.json(rows.map(row => ({ ...row, is_favorited: false })))
  }

  const { data: favoritesData } = await supabase
    .from('favorites')
    .select('cleaner_profile_id')
    .eq('customer_id', session.user.id)
  const favorites = (favoritesData ?? []) as { cleaner_profile_id: string }[]
  const favoritedIds = new Set(favorites.map(f => f.cleaner_profile_id))

  return NextResponse.json(rows.map(row => ({ ...row, is_favorited: favoritedIds.has(row.id) })))
}
