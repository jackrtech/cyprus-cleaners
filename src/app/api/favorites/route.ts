import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Customer-only shortlist of cleaners, independent of introductions/bookings
// — see supabase/schema.sql's FAVORITES block for why it's a separate table.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('favorites')
    .select('cleaner_profile_id')
    .eq('customer_id', session.user.id)

  if (error) {
    console.error('GET favorites error:', error)
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
  }

  const favorites = (data ?? []) as { cleaner_profile_id: string }[]
  return NextResponse.json(favorites.map(f => f.cleaner_profile_id))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { cleaner_profile_id } = body
  if (typeof cleaner_profile_id !== 'string' || !cleaner_profile_id) {
    return NextResponse.json({ error: 'cleaner_profile_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('favorites')
    .insert({ customer_id: session.user.id, cleaner_profile_id })

  // Already favorited — same idempotent treatment as starting an
  // introduction twice (POST /api/introductions): not an error.
  if (error && error.code !== '23505') {
    console.error('POST favorites error:', error)
    return NextResponse.json({ error: 'Failed to favorite cleaner' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
