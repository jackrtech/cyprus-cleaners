import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { sendNewIntroEmail } from '@/lib/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const body = await req.json()
  const { cleaner_profile_id: rawProfileId, cleaner_slug, message } = body

  let cleaner_profile_id: string | undefined = rawProfileId

  // Fallback: resolve cleaner_profile_id from slug if only slug was provided
  if (!cleaner_profile_id && cleaner_slug) {
    const { data: profileBySlug } = await supabase
      .from('cleaner_profiles')
      .select('id')
      .eq('slug', cleaner_slug)
      .single()
    if (profileBySlug) cleaner_profile_id = profileBySlug.id
  }

  if (!cleaner_profile_id) {
    return NextResponse.json({ error: 'cleaner_profile_id is required' }, { status: 400 })
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }
  if (message.length > 500) {
    return NextResponse.json({ error: 'Message must be 500 characters or fewer' }, { status: 400 })
  }

  // Guard: reject if there is already a PENDING or APPROVED introduction
  const { data: existing } = await supabase
    .from('introductions')
    .select('id')
    .eq('customer_id', session.user.id)
    .eq('cleaner_profile_id', cleaner_profile_id)
    .in('status', ['PENDING', 'APPROVED'])
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have an active introduction with this cleaner.' },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('introductions')
    .insert({
      customer_id:       session.user.id,
      cleaner_profile_id,
      message:           message.trim(),
      status:            'PENDING',
    })
    .select('id, status')
    .single()

  if (error || !data) {
    console.error('Introduction insert error:', error)
    return NextResponse.json({ error: 'Failed to create introduction' }, { status: 500 })
  }

  // Send email notification to cleaner — non-blocking, errors are swallowed
  try {
    // Check last_emailed_at guard
    const { data: freshIntro } = await supabase
      .from('introductions')
      .select('last_emailed_at')
      .eq('id', data.id)
      .single()

    const lastEmailed = freshIntro?.last_emailed_at as string | null
    const tooSoon = lastEmailed && (Date.now() - new Date(lastEmailed).getTime()) < 60 * 60 * 1000

    if (!tooSoon) {
      // Resolve cleaner's email via cleaner_profile → users
      const { data: cleanerProfile } = await supabase
        .from('cleaner_profiles')
        .select('user_id')
        .eq('id', cleaner_profile_id)
        .single()

      if (cleanerProfile) {
        const { data: cleanerUser } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('id', cleanerProfile.user_id)
          .single()

        if (cleanerUser?.email) {
          await sendNewIntroEmail({
            cleanerEmail:  cleanerUser.email,
            cleanerLocale: null, // locale not stored in users table — defaults to EN
            customerName:  session.user.name ?? session.user.email,
            message,
            dashboardUrl:  `${BASE_URL}/dashboard/cleaner`,
          })

          await supabase
            .from('introductions')
            .update({ last_emailed_at: new Date().toISOString() })
            .eq('id', data.id)
        }
      }
    }
  } catch (emailErr) {
    console.error('Email send error (new intro):', emailErr)
  }

  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { role, id: userId } = session.user

  if (role === 'CUSTOMER') {
    const { data, error } = await supabase
      .from('introductions')
      .select(`
        id, status, message, created_at,
        cleaner_profiles ( display_name, photo_url, cities, phone, email )
      `)
      .eq('customer_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('GET introductions (CUSTOMER) error:', error)
      return NextResponse.json({ error: 'Failed to fetch introductions' }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  if (role === 'CLEANER') {
    const { data: profile } = await supabase
      .from('cleaner_profiles')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!profile) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('introductions')
      .select(`
        id, status, message, created_at,
        users ( full_name )
      `)
      .eq('cleaner_profile_id', profile.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('GET introductions (CLEANER) error:', error)
      return NextResponse.json({ error: 'Failed to fetch introductions' }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  // ADMIN: return everything
  const { data, error } = await supabase
    .from('introductions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET introductions (ADMIN) error:', error)
    return NextResponse.json({ error: 'Failed to fetch introductions' }, { status: 500 })
  }
  return NextResponse.json(data)
}
