import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { BOOKING_FEE_EUR } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select(`
      id, slug, display_name, bio, photo_url, cover_photo_url, city, cities,
      hourly_rate_eur, services, languages, cleaner_type,
      gender, verified, avg_rating, review_count,
      unique_customer_count, total_jobs_count, availability,
      is_mock, is_company, user_id, has_transport, created_at,
      cleaner_service_offerings ( code, price_eur )
    `)
    .eq('slug', params.slug)
    .eq('status', 'ACTIVE')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Don't leak the owning user_id to the public response — resolve it
  // server-side into a plain boolean the profile page can use to grey out
  // the "message this cleaner" CTA when a cleaner is viewing their own page.
  const session = await getServerSession(authOptions)
  const { user_id, ...publicData } = data
  const is_own_profile = session?.user?.id === user_id

  let is_favorited = false
  if (session?.user?.role === 'CUSTOMER') {
    const { data: favorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('customer_id', session.user.id)
      .eq('cleaner_profile_id', data.id)
      .maybeSingle()
    is_favorited = !!favorite
  }

  return NextResponse.json({ ...publicData, is_own_profile, is_favorited, booking_fee_eur: BOOKING_FEE_EUR })
}
