import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('slug', params.slug)
    .single()

  if (!profile) {
    return NextResponse.json([])
  }

  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, body_translations, created_at, customer_id, is_mock, users(full_name)')
    .eq('cleaner_profile_id', profile.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET reviews error:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }

  return NextResponse.json(data)
}
