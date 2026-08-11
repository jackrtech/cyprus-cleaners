import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select('id, slug, display_name, photo_url, city, cities, bio, id_submitted_at, created_at, users ( email, phone )')
    .not('id_submitted_at', 'is', null)
    .eq('verified', false)
    .order('id_submitted_at', { ascending: true })

  if (error) {
    console.error('GET admin verifications error:', error)
    return NextResponse.json({ error: 'Failed to fetch verification queue' }, { status: 500 })
  }

  return NextResponse.json(data)
}
