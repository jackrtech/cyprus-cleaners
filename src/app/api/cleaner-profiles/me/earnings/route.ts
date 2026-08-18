import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { releaseDuePayouts } from '@/lib/payouts'

interface PaymentRow {
  amount_eur:          number
  platform_fee_eur:    number | null
  cleaner_payout_eur:  number | null
  payout_status:       string
  payout_release_at:   string | null
}

interface BookingRow {
  id:         string
  date:       string
  start_time: string
  payments:   PaymentRow | PaymentRow[] | null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: profile, error: profileError } = await supabase
    .from('cleaner_profiles')
    .select('id, stripe_connect_account_id, stripe_connect_details_submitted, stripe_connect_payouts_enabled')
    .eq('user_id', session.user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Lazy backstop for the payout-release cron, same pattern as the dispute
  // auto-resolve check on GET /api/admin/disputes — guarantees this view is
  // never showing a stale "held" state past its actual release point.
  await releaseDuePayouts(supabase)

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, date, start_time,
      payments ( amount_eur, platform_fee_eur, cleaner_payout_eur, payout_status, payout_release_at )
    `)
    .eq('cleaner_profile_id', profile.id)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })

  if (error) {
    console.error('GET cleaner earnings error:', error)
    return NextResponse.json({ error: 'Failed to load earnings' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as BookingRow[]

  const jobs = rows
    .map(b => {
      const payment = Array.isArray(b.payments) ? b.payments[0] ?? null : b.payments
      if (!payment) return null
      const estimatedPayoutEur = payment.amount_eur - (payment.platform_fee_eur ?? 0)
      return {
        booking_id:         b.id,
        date:               b.date,
        start_time:         b.start_time,
        payout_status:      payment.payout_status,
        payout_eur:         payment.cleaner_payout_eur ?? estimatedPayoutEur,
        // PENDING always means "not decided yet" even if cleaner_payout_eur
        // happens to already be populated — true for every legacy row from
        // the pre-Connect backfill migration, which set it on every existing
        // payment regardless of payout_status.
        payout_is_final:    payment.payout_status !== 'PENDING',
        payout_release_at:  payment.payout_release_at,
      }
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)

  const summary = {
    held_eur:    jobs.filter(j => j.payout_status === 'PENDING').reduce((sum, j) => sum + j.payout_eur, 0),
    blocked_eur: jobs.filter(j => j.payout_status === 'BLOCKED').reduce((sum, j) => sum + j.payout_eur, 0),
    paid_eur:    jobs.filter(j => j.payout_status === 'PAID').reduce((sum, j) => sum + j.payout_eur, 0),
    failed_count: jobs.filter(j => j.payout_status === 'FAILED').length,
  }

  return NextResponse.json({
    connect: {
      account_id:         profile.stripe_connect_account_id,
      details_submitted:  profile.stripe_connect_details_submitted,
      payouts_enabled:    profile.stripe_connect_payouts_enabled,
    },
    summary,
    jobs,
  })
}
