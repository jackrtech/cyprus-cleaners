import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendVerificationEmail } from '@/lib/email'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, email_verified')
    .eq('id', session.user.id)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.email_verified) {
    return NextResponse.json({ error: 'Already verified' }, { status: 400 })
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: recentToken } = await supabase
    .from('verification_tokens')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('type', 'EMAIL_VERIFY')
    .is('used_at', null)
    .gte('created_at', fiveMinutesAgo)
    .maybeSingle()

  if (recentToken) {
    return NextResponse.json(
      { error: 'Please wait before requesting another email' },
      { status: 429 }
    )
  }

  await supabase
    .from('verification_tokens')
    .delete()
    .eq('user_id', session.user.id)
    .eq('type', 'EMAIL_VERIFY')
    .is('used_at', null)

  const token = crypto.randomUUID() + '-' + Date.now()

  const { error: insertError } = await supabase
    .from('verification_tokens')
    .insert({
      user_id:    session.user.id,
      token,
      type:       'EMAIL_VERIFY',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

  if (insertError) {
    console.error('verification_tokens insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create verification token' }, { status: 500 })
  }

  await sendVerificationEmail({ to: user.email, token, locale: 'en' })

  return NextResponse.json({ success: true })
}
