import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const SIGNED_URL_TTL = 60 * 60 // 1 hour

interface DisputeBooking {
  id: string
  date: string
  start_time: string
  duration_hours: number | null
  bedrooms: number | null
  bathrooms: number | null
  cleaning_type: string | null
  address: string | null
  photo_paths: string[]
}

interface DisputeRow {
  id: string
  claim: string
  cleaner_response: string | null
  status: string
  resolution: string | null
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  customer: { full_name: string } | null
  booking: DisputeBooking | null
}

// Disputes filed against the signed-in cleaner's own profile — no other
// cleaner's disputes are ever visible here.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json([])
  }

  const { data, error } = await supabase
    .from('disputes')
    .select(`
      id, claim, cleaner_response, status, resolution, admin_note, created_at, resolved_at,
      customer:users!disputes_customer_id_fkey ( full_name ),
      booking:bookings ( id, date, start_time, duration_hours, bedrooms, bathrooms, cleaning_type, address, photo_paths )
    `)
    .eq('cleaner_profile_id', profile.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('GET cleaner disputes error:', error)
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as DisputeRow[]
  const allPaths = rows.flatMap(d => d.booking?.photo_paths ?? [])
  let urlByPath = new Map<string, string>()
  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage.from('booking-photos').createSignedUrls(allPaths, SIGNED_URL_TTL)
    urlByPath = new Map((signed ?? []).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]))
  }

  const withPhotoUrls = rows.map(d => {
    const photo_urls = (d.booking?.photo_paths ?? []).map(p => urlByPath.get(p)).filter((u): u is string => !!u)
    return { ...d, booking: d.booking ? { ...d.booking, photo_urls } : null }
  })

  return NextResponse.json(withPhotoUrls)
}
