import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPasswordResetEmail } from '@/lib/email'

const ForgotPasswordSchema = z.object({ email: z.string().email() })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = ForgotPasswordSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const { email } = result.data
    const supabase = createAdminClient()

    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (!user) {
      return NextResponse.json({ success: true })
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const { data: recentToken } = await supabase
      .from('verification_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'PASSWORD_RESET')
      .is('used_at', null)
      .gte('created_at', fiveMinutesAgo)
      .maybeSingle()

    if (recentToken) {
      return NextResponse.json({ success: true })
    }

    await supabase
      .from('verification_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('type', 'PASSWORD_RESET')
      .is('used_at', null)

    const token = crypto.randomUUID() + '-' + Date.now()

    await supabase.from('verification_tokens').insert({
      user_id:    user.id,
      token,
      type:       'PASSWORD_RESET',
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    })

    await sendPasswordResetEmail({ to: user.email, token, locale: 'en' })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Forgot password error:', err)
    return NextResponse.json({ success: true })
  }
}
