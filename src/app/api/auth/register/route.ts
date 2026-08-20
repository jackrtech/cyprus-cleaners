import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { sendVerificationEmail } from '@/lib/email'
import { generateReferralCode } from '@/lib/referrals'
import { awardReferralBadge } from '@/lib/badges'
import type { UserRole } from '@/types'

const RegisterSchema = z.object({
  email:           z.string().email('Invalid email'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  full_name:       z.string().min(2, 'Full name required'),
  role:            z.enum(['CUSTOMER', 'CLEANER']),
  phone:           z.string().optional(),
  cities:          z.array(z.string()).min(1).optional(),
  hourly_rate_eur: z.number().min(5).optional(),
  cleaner_type:    z.enum(['individual', 'company']).optional(),
  locale:          z.enum(['en', 'el']).optional().default('en'),
  // Cleaner-referral tracking (see /get-started?ref=<code>) -- the code of
  // whichever cleaner's link this signup came in through, if any. Purely
  // additive: an invalid or absent code just means no referral is recorded,
  // never blocks registration.
  referred_by_code: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = RegisterSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { email, password, full_name, role, phone, cities, hourly_rate_eur, cleaner_type, locale, referred_by_code } = result.data
    const supabase = createAdminClient()

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12)

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email:         email.toLowerCase().trim(),
        password_hash,
        role:          role as UserRole,
        full_name:     full_name.trim(),
        phone:         phone?.trim() || null,
        locale,
      })
      .select('id, email, role, full_name')
      .single()

    if (userError || !user) {
      console.error('User creation error:', userError)
      return NextResponse.json(
        { error: 'Failed to create account. Please try again.' },
        { status: 500 }
      )
    }

    // If registering as CLEANER, create a stub profile immediately
    if (role === 'CLEANER') {
      const slug = slugify(full_name) + '-' + user.id.slice(0, 6)

      // Referral capture -- look up whichever cleaner's code this signup
      // came in through, if any. An invalid/unknown code is silently
      // ignored (never blocks registration), same as if none was provided.
      let referredByCleanerProfileId: string | null = null
      if (referred_by_code) {
        const { data: referrer } = await supabase
          .from('cleaner_profiles')
          .select('id')
          .eq('referral_code', referred_by_code)
          .eq('status', 'ACTIVE')
          .maybeSingle()
        referredByCleanerProfileId = referrer?.id ?? null
      }

      const { error: profileError } = await supabase.from('cleaner_profiles').insert({
        user_id:         user.id,
        slug,
        display_name:    full_name.trim(),
        city:            (cities ?? [])[0] ?? '',
        cities:          cities ?? [],
        hourly_rate_eur: Number(hourly_rate_eur ?? 10),
        cleaner_type:    cleaner_type ?? 'individual',
        is_company:      cleaner_type === 'company',
        gender:          null,
        status:          'ACTIVE',
        referral_code:   generateReferralCode(),
        referred_by_cleaner_profile_id: referredByCleanerProfileId,
      })

      if (profileError) {
        console.error('cleaner_profiles insert error:', profileError)
      } else if (referredByCleanerProfileId) {
        await awardReferralBadge(supabase, referredByCleanerProfileId)
      }
    }

    // Send verification email
    try {
      const token = crypto.randomUUID() + '-' + Date.now()
      await supabase.from('verification_tokens').insert({
        user_id:    user.id,
        token,
        type:       'EMAIL_VERIFY',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      await sendVerificationEmail({ to: user.email, token, locale, name: user.full_name })
    } catch (emailErr) {
      console.error('Verification email error:', emailErr)
      // Do not fail registration if email sending fails
    }

    return NextResponse.json({ success: true, user: { id: user.id, role: user.role } })
  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
