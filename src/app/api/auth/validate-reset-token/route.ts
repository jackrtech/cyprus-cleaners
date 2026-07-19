import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { token } = await req.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ valid: false }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: verificationToken } = await supabase
    .from('verification_tokens')
    .select('id')
    .eq('token', token)
    .eq('type', 'PASSWORD_RESET')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!verificationToken) {
    return NextResponse.json({ valid: false }, { status: 400 })
  }

  return NextResponse.json({ valid: true })
}
