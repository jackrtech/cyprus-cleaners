import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// Step 2 of ID submission — called once both files have actually landed in
// storage (the browser uploaded them directly via the signed URLs from
// POST /api/cleaner-profiles/id-upload). Paths are deterministic per
// profile, so this just records that a submission happened; it doesn't
// re-verify the files exist; a missing file would simply 404 for the admin.
export async function POST() {
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

  const { error } = await supabase
    .from('cleaner_profiles')
    .update({
      id_photo_url:        `${profile.id}/id-document`,
      selfie_photo_url:     `${profile.id}/selfie`,
      id_submitted_at:      new Date().toISOString(),
      verification_status: 'PENDING',
      verification_note:    null, // clear any note from a previous rejection — this is a fresh submission
    })
    .eq('id', profile.id)

  if (error) {
    console.error('ID upload confirm error:', error)
    return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
  }

  return NextResponse.json({ status: 'PENDING' })
}
