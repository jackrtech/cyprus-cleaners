import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const SIGNED_URL_TTL = 60 * 60 // 1 hour

interface NoShowFlagRow {
  id: string
  claim: string
  status: string
  cleaner_response: string | null
  contested_at: string | null
  resolve_by: string
  resolution: string | null
  redirect_cleaner_profile_id: string | null
  split_percentage: number | null
  refund_amount_eur: number | null
  redirect_amount_eur: number | null
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  flagged_by_user: { id: string; full_name: string; email: string } | null
  no_show_corroborations: { cleaner_profile_id: string; response: string; note: string | null; cleaner_profiles: { display_name: string } | { display_name: string }[] | null }[] | null
  assignment: {
    id: string
    cleaner_profile_id: string
    tier_rate_eur: number
    platform_fee_eur: number | null
    cleaner_profiles: { id: string; display_name: string; user_id: string | null } | { id: string; display_name: string; user_id: string | null }[] | null
  } | { id: string; cleaner_profile_id: string; tier_rate_eur: number; platform_fee_eur: number | null; cleaner_profiles: { id: string; display_name: string; user_id: string | null } | { id: string; display_name: string; user_id: string | null }[] | null }[] | null
  booking: {
    id: string
    date: string
    start_time: string
    duration_hours: number | null
    address: string | null
    photo_paths: string[]
    booking_assignments: { cleaner_profile_id: string; cleaner_profiles: { id: string; display_name: string } | { id: string; display_name: string }[] | null }[] | null
  } | { id: string; date: string; start_time: string; duration_hours: number | null; address: string | null; photo_paths: string[]; booking_assignments: { cleaner_profile_id: string; cleaner_profiles: { id: string; display_name: string } | { id: string; display_name: string }[] | null }[] | null }[] | null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  // Both PENDING and resolved flags stay on the list — a resolved flag is
  // still part of the record, same as the disputes queue.
  const { data, error } = await supabase
    .from('no_show_flags')
    .select(`
      id, claim, status, cleaner_response, contested_at, resolve_by, resolution, redirect_cleaner_profile_id, split_percentage, refund_amount_eur, redirect_amount_eur, admin_note, created_at, resolved_at,
      flagged_by_user:users!no_show_flags_flagged_by_fkey ( id, full_name, email ),
      no_show_corroborations ( cleaner_profile_id, response, note, cleaner_profiles ( display_name ) ),
      assignment:booking_assignments!no_show_flags_assignment_id_fkey ( id, cleaner_profile_id, tier_rate_eur, platform_fee_eur, cleaner_profiles ( id, display_name, user_id ) ),
      booking:bookings ( id, date, start_time, duration_hours, address, photo_paths, booking_assignments ( cleaner_profile_id, cleaner_profiles ( id, display_name ) ) )
    `)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('GET admin no-show-flags error:', error)
    return NextResponse.json({ error: 'Failed to fetch no-show flags' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as NoShowFlagRow[]
  const allPaths = rows.flatMap(r => (Array.isArray(r.booking) ? r.booking[0]?.photo_paths : r.booking?.photo_paths) ?? [])
  let urlByPath = new Map<string, string>()
  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage.from('booking-photos').createSignedUrls(allPaths, SIGNED_URL_TTL)
    urlByPath = new Map((signed ?? []).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]))
  }

  const withPhotoUrls = rows.map(r => {
    const booking = Array.isArray(r.booking) ? r.booking[0] ?? null : r.booking
    const photo_urls = (booking?.photo_paths ?? []).map(p => urlByPath.get(p)).filter((u): u is string => !!u)
    return { ...r, booking: booking ? { ...booking, photo_urls } : null }
  })

  return NextResponse.json(withPhotoUrls)
}
