import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { token } = await req.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: verificationToken, error: tokenError } = await supabase
    .from('verification_tokens')
    .select('id, user_id, expires_at')
    .eq('token', token)
    .eq('type', 'EMAIL_VERIFY')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (tokenError || !verificationToken) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  await supabase
    .from('users')
    .update({ email_verified: true })
    .eq('id', verificationToken.user_id)

  await supabase
    .from('verification_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', verificationToken.id)

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', verificationToken.user_id)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  return NextResponse.json({ success: true, role: user.role })
}
