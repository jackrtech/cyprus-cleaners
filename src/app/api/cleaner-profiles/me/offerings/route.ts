import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { ALL_OFFERING_CODES, isOfferingCode } from '@/lib/serviceOfferings'

// Sibling to /api/cleaner-profiles/me rather than folded into its
// ALLOWED_FIELDS whitelist — that route's PATCH is a flat-column update,
// which doesn't fit a one-to-many child table. This route replaces the
// cleaner's whole offerings set in one PATCH, same "whole-object" ergonomics
// as the availability field on the main route.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const body = await req.json()
  const offerings = body?.offerings

  if (!Array.isArray(offerings)) {
    return NextResponse.json({ error: 'offerings must be an array' }, { status: 400 })
  }
  for (const o of offerings) {
    if (!o || typeof o.code !== 'string' || !isOfferingCode(o.code)) {
      return NextResponse.json({ error: `code must be one of ${ALL_OFFERING_CODES.join(', ')}` }, { status: 400 })
    }
    if (typeof o.price_eur !== 'number' || !Number.isFinite(o.price_eur) || o.price_eur <= 0) {
      return NextResponse.json({ error: 'price_eur must be a positive number' }, { status: 400 })
    }
  }
  const codes = offerings.map(o => o.code)
  if (new Set(codes).size !== codes.length) {
    return NextResponse.json({ error: 'Duplicate offering codes are not allowed' }, { status: 400 })
  }

  // Replace-all: simplest correct approach for a small (max 4-row) whole-set
  // PATCH — delete anything not resubmitted, then insert the current set.
  const { error: deleteError } = await supabase
    .from('cleaner_service_offerings')
    .delete()
    .eq('cleaner_profile_id', profile.id)

  if (deleteError) {
    console.error('Offerings delete error:', deleteError)
    return NextResponse.json({ error: 'Failed to update offerings' }, { status: 500 })
  }

  if (offerings.length > 0) {
    const { error: insertError } = await supabase.from('cleaner_service_offerings').insert(
      offerings.map(o => ({
        cleaner_profile_id: profile.id,
        code: o.code,
        price_eur: o.price_eur,
      }))
    )
    if (insertError) {
      console.error('Offerings insert error:', insertError)
      return NextResponse.json({ error: 'Failed to update offerings' }, { status: 500 })
    }
  }

  return NextResponse.json({ offerings })
}
