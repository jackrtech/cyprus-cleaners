import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import type { UserRole } from '@/types'

const RegisterSchema = z.object({
  email:     z.string().email('Invalid email'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name required'),
  role:      z.enum(['CUSTOMER', 'CLEANER']),
  phone:     z.string().optional(),
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

    const { email, password, full_name, role, phone } = result.data
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
      await supabase.from('cleaner_profiles').insert({
        user_id:        user.id,
        slug,
        display_name:   full_name.trim(),
        city:           'Nicosia', // Default — updated in profile editor
        hourly_rate_eur: 15,       // Default — updated in profile editor
        status:         'PAUSED',  // Paused until they complete their profile
      })
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
