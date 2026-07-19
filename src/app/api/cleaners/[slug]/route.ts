import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select(`
      id, slug, display_name, bio, photo_url, city, cities,
      hourly_rate_eur, services, languages, cleaner_type,
      gender, verified, avg_rating, review_count,
      unique_customer_count, total_jobs_count, availability,
      is_mock, is_company
    `)
    .eq('slug', params.slug)
    .eq('status', 'ACTIVE')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
