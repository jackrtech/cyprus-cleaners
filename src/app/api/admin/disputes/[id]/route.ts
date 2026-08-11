import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendDisputeResolvedEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const VALID_RESOLUTIONS = ['CUSTOMER', 'CLEANER'] as const
type Resolution = typeof VALID_RESOLUTIONS[number]

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
  const resolution: Resolution = body.resolution
  const note: string | null = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null

  if (!VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json(
      { error: `resolution must be one of ${VALID_RESOLUTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: dispute, error: fetchError } = await supabase
    .from('disputes')
    .select('id, status, customer_id, cleaner_profile_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
  }
  if (dispute.status !== 'OPEN') {
    return NextResponse.json({ error: 'This dispute has already been resolved' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('disputes')
    .update({
      status: 'RESOLVED',
      resolution,
      admin_note: note,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('PATCH admin dispute error:', updateError)
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 })
  }

  // Notify both parties of the outcome — non-blocking, errors are swallowed
  try {
    const [{ data: customerUser }, { data: cleanerProfile }] = await Promise.all([
      supabase.from('users').select('email, locale').eq('id', dispute.customer_id).single(),
      supabase.from('cleaner_profiles').select('user_id').eq('id', dispute.cleaner_profile_id).single(),
    ])

    if (customerUser?.email) {
      await sendDisputeResolvedEmail({
        to: customerUser.email,
        locale: customerUser.locale,
        outcome: resolution === 'CUSTOMER' ? 'WON' : 'LOST',
        note,
        dashboardUrl: `${BASE_URL}/dashboard`,
      })
    }

    if (cleanerProfile?.user_id) {
      const { data: cleanerUser } = await supabase
        .from('users')
        .select('email, locale')
        .eq('id', cleanerProfile.user_id)
        .single()

      if (cleanerUser?.email) {
        await sendDisputeResolvedEmail({
          to: cleanerUser.email,
          locale: cleanerUser.locale,
          outcome: resolution === 'CLEANER' ? 'WON' : 'LOST',
          note,
          dashboardUrl: `${BASE_URL}/dashboard/cleaner`,
        })
      }
    }
  } catch (emailErr) {
    console.error('Email send error (dispute resolved):', emailErr)
  }

  return NextResponse.json(updated)
}
