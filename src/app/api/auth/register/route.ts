import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
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

    const { email, password, full_name, role, phone, cities, hourly_rate_eur, cleaner_type } = result.data
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
      })

      if (profileError) {
        console.error('cleaner_profiles insert error:', profileError)
      }
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
