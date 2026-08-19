import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { autoResolveOverdueDisputes } from '@/lib/disputes'

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
  notes: string | null
  photo_paths: string[]
  payments: { status: string; amount_eur: number } | { status: string; amount_eur: number }[] | null
}

interface DisputeAssignment {
  cleaner_profile_id: string
  tier_rate_eur: number
  platform_fee_eur: number | null
  cleaner_profiles: { id: string; display_name: string; user_id: string | null } | { id: string; display_name: string; user_id: string | null }[] | null
}

interface DisputeAssignmentOutcome {
  cleaner_profile_id: string
  resolution: string
  refund_percentage: number
}

interface DisputeRow {
  id: string
  claim: string
  cleaner_response: string | null
  status: string
  resolution: string | null
  refund_percentage: number
  resolve_by: string | null
  auto_resolved: boolean
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  customer: { id: string; full_name: string; email: string } | null
  cleaner_profiles: { id: string; display_name: string; user_id: string | null } | null
  dispute_assignment_outcomes: DisputeAssignmentOutcome[] | null
  booking: (DisputeBooking & { booking_assignments: DisputeAssignment[] | null }) | null
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

  // Lazy backstop for the 24h auto-resolve SLA, same idea as bookings'
  // expireOverdueRequests() — the cron (vercel.json) is the primary trigger,
  // this just guarantees a breach is caught the moment an admin opens the
  // queue even if the cron hasn't fired yet.
  await autoResolveOverdueDisputes(supabase)

  // Both open and resolved disputes stay on the list — a resolved dispute is
  // still part of the record, not something to just disappear once handled.
  const { data, error } = await supabase
    .from('disputes')
    .select(`
      id, claim, cleaner_response, status, resolution, refund_percentage, resolve_by, auto_resolved, admin_note, created_at, resolved_at,
      customer:users!disputes_customer_id_fkey ( id, full_name, email ),
      cleaner_profiles ( id, display_name, user_id ),
      dispute_assignment_outcomes ( cleaner_profile_id, resolution, refund_percentage ),
      booking:bookings ( id, date, start_time, duration_hours, bedrooms, bathrooms, cleaning_type, address, notes, photo_paths, payments ( status, amount_eur ), booking_assignments ( cleaner_profile_id, tier_rate_eur, platform_fee_eur, cleaner_profiles ( id, display_name, user_id ) ) )
    `)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('GET admin disputes error:', error)
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
  }

  // Resolve booking completion photos to signed URLs — booking-photos is a
  // private bucket, same pattern as /api/bookings.
  const rows = (data ?? []) as unknown as DisputeRow[]
  const allPaths = rows.flatMap(d => d.booking?.photo_paths ?? [])
  let urlByPath = new Map<string, string>()
  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage.from('booking-photos').createSignedUrls(allPaths, SIGNED_URL_TTL)
    urlByPath = new Map((signed ?? []).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]))
  }

  const withPhotoUrls = rows.map(d => {
    const photo_urls = (d.booking?.photo_paths ?? []).map(p => urlByPath.get(p)).filter((u): u is string => !!u)
    const payment = Array.isArray(d.booking?.payments) ? d.booking?.payments[0] ?? null : d.booking?.payments ?? null
    return { ...d, booking: d.booking ? { ...d.booking, photo_urls, payment } : null }
  })

  return NextResponse.json(withPhotoUrls)
}
