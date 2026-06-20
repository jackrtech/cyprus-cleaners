import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendIntroApprovedEmail, sendIntroDeclinedEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { action } = body

  if (action !== 'APPROVE' && action !== 'DECLINE') {
    return NextResponse.json(
      { error: 'action must be APPROVE or DECLINE' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Fetch the introduction (include customer_id and last_emailed_at for email trigger)
  const { data: intro, error: fetchError } = await supabase
    .from('introductions')
    .select('id, cleaner_profile_id, customer_id, last_emailed_at, status')
    .eq('id', params.id)
    .single()

  if (fetchError || !intro) {
    return NextResponse.json({ error: 'Introduction not found' }, { status: 404 })
  }

  // Verify the introduction's cleaner_profile belongs to the session user
  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('id', intro.cleaner_profile_id)
    .eq('user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const newStatus = action === 'APPROVE' ? 'APPROVED' : 'DECLINED'

  const { data, error } = await supabase
    .from('introductions')
    .update({ status: newStatus })
    .eq('id', params.id)
    .select()
    .single()

  if (error || !data) {
    console.error('Introduction update error:', error)
    return NextResponse.json({ error: 'Failed to update introduction' }, { status: 500 })
  }

  // Send email notification to customer — non-blocking, errors are swallowed
  try {
    const lastEmailed = intro.last_emailed_at as string | null
    const tooSoon = lastEmailed && (Date.now() - new Date(lastEmailed).getTime()) < 60 * 60 * 1000

    if (!tooSoon) {
      // Fetch customer user record
      const { data: customerUser } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', intro.customer_id)
        .single()

      // Fetch cleaner display_name + contact details via cleaner_profiles → users
      const { data: cleanerProfile } = await supabase
        .from('cleaner_profiles')
        .select('user_id, display_name')
        .eq('id', intro.cleaner_profile_id)
        .single()

      const cleanerDisplayName = cleanerProfile?.display_name as string ?? ''

      let cleanerContactEmail: string | null = null
      let cleanerPhone: string | null = null

      if (cleanerProfile?.user_id) {
        const { data: cleanerUser } = await supabase
          .from('users')
          .select('email, phone')
          .eq('id', cleanerProfile.user_id)
          .single()
        cleanerContactEmail = cleanerUser?.email ?? null
        cleanerPhone        = cleanerUser?.phone ?? null
      }

      if (customerUser?.email) {
        if (action === 'APPROVE') {
          await sendIntroApprovedEmail({
            customerEmail:  customerUser.email,
            customerLocale: null, // locale not stored in users table — defaults to EN
            cleanerName:    cleanerDisplayName,
            cleanerPhone,
            cleanerEmail:   cleanerContactEmail,
            dashboardUrl:   `${BASE_URL}/dashboard`,
          })
        } else {
          await sendIntroDeclinedEmail({
            customerEmail:  customerUser.email,
            customerLocale: null,
            cleanerName:    cleanerDisplayName,
            dashboardUrl:   `${BASE_URL}/cleaners`,
          })
        }

        await supabase
          .from('introductions')
          .update({ last_emailed_at: new Date().toISOString() })
          .eq('id', params.id)
      }
    }
  } catch (emailErr) {
    console.error('Email send error (intro action):', emailErr)
  }

  return NextResponse.json(data)
}
