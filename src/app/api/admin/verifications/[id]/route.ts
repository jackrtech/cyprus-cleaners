import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendVerificationApprovedEmail, sendVerificationRejectedEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const VALID_ACTIONS = ['APPROVE', 'REJECT'] as const
type Action = typeof VALID_ACTIONS[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const action: Action = body.action
  const note: string | null = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: profile, error: fetchError } = await supabase
    .from('cleaner_profiles')
    .select('id, id_submitted_at, verified, user_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json({ error: 'Cleaner profile not found' }, { status: 404 })
  }
  if (!profile.id_submitted_at) {
    return NextResponse.json({ error: 'No verification submission pending for this profile' }, { status: 400 })
  }

  // Reject clears id_submitted_at so the cleaner can resubmit; there's no
  // separate submission flow yet, so this just resets the queue state.
  const update = action === 'APPROVE'
    ? { verified: true, verification_note: note }
    : { verified: false, id_submitted_at: null, verification_note: note }

  const { error: updateError } = await supabase
    .from('cleaner_profiles')
    .update(update)
    .eq('id', params.id)

  if (updateError) {
    console.error('PATCH admin verification error:', updateError)
    return NextResponse.json({ error: 'Failed to update verification status' }, { status: 500 })
  }

  // Notify the cleaner of the outcome — non-blocking, errors are swallowed
  try {
    if (profile.user_id) {
      const { data: cleanerUser } = await supabase
        .from('users')
        .select('email, locale')
        .eq('id', profile.user_id)
        .single()

      if (cleanerUser?.email) {
        if (action === 'APPROVE') {
          await sendVerificationApprovedEmail({
            to: cleanerUser.email,
            locale: cleanerUser.locale,
            dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
          })
        } else {
          await sendVerificationRejectedEmail({
            to: cleanerUser.email,
            locale: cleanerUser.locale,
            note,
            dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
          })
        }
      }
    }
  } catch (emailErr) {
    console.error(`Email send error (verification ${action.toLowerCase()}):`, emailErr)
  }

  return NextResponse.json({ ok: true })
}
