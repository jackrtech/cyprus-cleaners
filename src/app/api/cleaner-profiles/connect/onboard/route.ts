import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Creates (or reuses) a Stripe Connect Express account for the signed-in
// cleaner, then returns a fresh Account Link to Stripe's hosted onboarding
// flow. Only the `transfers` capability is requested — the connected
// account never processes a card charge itself (that stays on the platform
// account; see schema.sql's payments table comment on "separate charges and
// transfers"), so onboarding only needs identity + bank details, not the
// heavier KYC a `card_payments`-capable account would require.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: profile, error: profileError } = await supabase
    .from('cleaner_profiles')
    .select('id, stripe_connect_account_id')
    .eq('user_id', session.user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  try {
    const stripe = getStripe()
    let accountId = profile.stripe_connect_account_id

    if (!accountId) {
      const account = await stripe.accounts.create({
        type:    'express',
        country: 'CY',
        email:   session.user.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { cleaner_profile_id: profile.id },
      })
      accountId = account.id
      await supabase.from('cleaner_profiles').update({ stripe_connect_account_id: accountId }).eq('id', profile.id)
    }

    const returnUrl = `${BASE_URL}/dashboard/cleaner/earnings?onboarded=1`
    const accountLink = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${BASE_URL}/dashboard/cleaner/earnings?refresh=1`,
      return_url:  returnUrl,
      type:        'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    console.error('Connect onboarding link failed:', err)
    const message = err instanceof Stripe.errors.StripeError
      ? err.message
      : 'Could not start payout setup — please try again'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
