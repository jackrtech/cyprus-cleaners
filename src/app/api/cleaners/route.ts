import { NextResponse } from 'next/server'
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

  return NextResponse.json(data)
}
