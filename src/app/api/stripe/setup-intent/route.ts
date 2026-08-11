import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

// Creates (or reuses) a Stripe Customer for the signed-in customer, then a
// SetupIntent so the frontend can save a card for later off-session use — the
// card is charged when the cleaner confirms the booking, not now, and the
// customer isn't present for that step, so their payment method has to be
// on file in advance.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const stripe = getStripe()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, stripe_customer_id')
    .eq('id', session.user.id)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let stripeCustomerId = user.stripe_customer_id

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name:  user.full_name,
      metadata: { user_id: user.id },
    })
    stripeCustomerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: stripeCustomerId }).eq('id', user.id)
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    usage: 'off_session',
    payment_method_types: ['card'],
  })

  return NextResponse.json({ clientSecret: setupIntent.client_secret })
}
