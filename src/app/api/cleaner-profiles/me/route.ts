import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAndAwardProfileCompletionBadge, checkAndAwardTenureMilestones } from '@/lib/badges'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select('*, cleaner_service_offerings ( code, price_eur )')
    .eq('user_id', session.user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Lazy checks, same pattern as the payout-release/dispute-auto-resolve
  // backstops elsewhere -- tenure in particular has no triggering event, so
  // "whenever the cleaner's own profile loads" is the only place it can be
  // evaluated short of adding a new cron.
  await checkAndAwardTenureMilestones(supabase, data.id, data.created_at)
  await checkAndAwardProfileCompletionBadge(supabase, data.id, data)

  return NextResponse.json(data)
}

const ALLOWED_FIELDS = new Set([
  'display_name', 'bio', 'photo_url', 'cover_photo_url', 'cities',
  'hourly_rate_eur', 'cleaner_type', 'gender', 'languages', 'availability', 'has_transport',
])

export async function PATCH(req: NextRequest) {
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
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const body = await req.json()

  // Only update fields that are explicitly present in the body and allowed
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) updates[key] = value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .update(updates)
    .eq('id', profile.id)
    .select()
    .single()

  if (error || !data) {
    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  await checkAndAwardProfileCompletionBadge(supabase, data.id, data)

  return NextResponse.json(data)
}
