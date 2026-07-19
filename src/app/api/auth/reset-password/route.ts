import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { token, password } = await req.json()

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: verificationToken, error: tokenError } = await supabase
    .from('verification_tokens')
    .select('id, user_id')
    .eq('token', token)
    .eq('type', 'PASSWORD_RESET')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (tokenError || !verificationToken) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  await supabase
    .from('users')
    .update({ password_hash })
    .eq('id', verificationToken.user_id)

  await supabase
    .from('verification_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', verificationToken.id)

  return NextResponse.json({ success: true })
}
