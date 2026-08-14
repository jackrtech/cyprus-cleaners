import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/test/mocks/supabase'

const { client, setFromResult, queueFromResults } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => client,
}))
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))
const mockStripe = {
  paymentIntents: { create: vi.fn() },
  refunds: { create: vi.fn() },
}
vi.mock('@/lib/stripe', () => ({
  getStripe: () => mockStripe,
}))
vi.mock('@/lib/email', () => ({
  sendBookingConfirmedEmail:      vi.fn(() => Promise.resolve()),
  sendBookingCompletedEmail:      vi.fn(() => Promise.resolve()),
  sendBookingDeclinedEmail:       vi.fn(() => Promise.resolve()),
  sendBookingCancelledEmail:      vi.fn(() => Promise.resolve()),
  sendRefundFailedAlertEmail:     vi.fn(() => Promise.resolve()),
  sendBookingConfirmedAdminAlertEmail: vi.fn(() => Promise.resolve()),
}))

import { getServerSession } from 'next-auth/next'
import { PATCH } from './route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/bookings/booking-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0]
}

function mockSession(userId: string, role = 'CUSTOMER') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'x@example.com', name: 'X', role, avatar_url: null },
  } as never)
}

const BASE_BOOKING = {
  id: 'booking-1',
  introduction_id: 'intro-1',
  customer_id: 'customer-1',
  cleaner_profile_id: 'cleaner-profile-1',
  status: 'REQUESTED',
  date: '2099-01-01',
  start_time: '10:00',
  duration_hours: 2,
  created_at: new Date().toISOString(),
  photo_paths: [],
}

describe('PATCH /api/bookings/[id] — CONFIRM authorization', () => {
  beforeEach(() => {
    client.from.mockClear()
  })

  it('403s when the customer tries to confirm their own booking', async () => {
    mockSession('customer-1', 'CUSTOMER')
    setFromResult('bookings', { data: BASE_BOOKING, error: null })
    setFromResult('cleaner_profiles', { data: { user_id: 'cleaner-user-1', display_name: 'Cleaner' }, error: null })

    const res = await PATCH(makeRequest({ action: 'CONFIRM' }), { params: { id: 'booking-1' } })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the cleaner/i)
  })

  it('lets the assigned cleaner proceed past the authorization check', async () => {
    mockSession('cleaner-user-1', 'CLEANER')
    setFromResult('bookings', { data: BASE_BOOKING, error: null })
    setFromResult('cleaner_profiles', { data: { user_id: 'cleaner-user-1', display_name: 'Cleaner' }, error: null })
    // No payment row configured — route should fail past authorization with a
    // 409 ("no payment method on file"), not the 403 a wrong-role caller gets.
    setFromResult('payments', { data: null, error: { message: 'not found' } })

    const res = await PATCH(makeRequest({ action: 'CONFIRM' }), { params: { id: 'booking-1' } })

    expect(res.status).not.toBe(403)
  })

  it('403s when a different customer tries to cancel someone else\'s booking', async () => {
    mockSession('someone-else', 'CUSTOMER')
    setFromResult('bookings', { data: BASE_BOOKING, error: null })
    setFromResult('cleaner_profiles', { data: { user_id: 'cleaner-user-1', display_name: 'Cleaner' }, error: null })

    const res = await PATCH(makeRequest({ action: 'CANCEL' }), { params: { id: 'booking-1' } })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/bookings/[id] — CONFIRM success path', () => {
  beforeEach(() => {
    client.from.mockClear()
    mockStripe.paymentIntents.create.mockReset()
  })

  it('moves a REQUESTED booking to CONFIRMED and charges the saved card', async () => {
    mockSession('cleaner-user-1', 'CLEANER')
    queueFromResults<unknown>('bookings',
      { data: BASE_BOOKING, error: null }, // initial fetch
      { data: [{ ...BASE_BOOKING, status: 'CONFIRMED' }], error: null } // guarded update+select
    )
    setFromResult('cleaner_profiles', { data: { user_id: 'cleaner-user-1', display_name: 'Cleaner' }, error: null })
    queueFromResults('payments',
      { data: { id: 'payment-1', amount_eur: 100, status: 'PENDING', provider_payment_method_id: 'pm_123' }, error: null }, // pre-charge fetch
      { data: null, error: null }, // status -> PAID write, result unread
      { data: { amount_eur: 100 }, error: null } // admin-alert amount fetch
    )
    setFromResult('users', { data: { stripe_customer_id: 'cus_123', email: 'customer@example.com', full_name: 'Customer Name' }, error: null })
    mockStripe.paymentIntents.create.mockResolvedValueOnce({ status: 'succeeded', id: 'pi_test123' })

    const res = await PATCH(makeRequest({ action: 'CONFIRM' }), { params: { id: 'booking-1' } })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('CONFIRMED')
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'pm_123', off_session: true, confirm: true }),
      expect.objectContaining({ idempotencyKey: 'confirm-booking-1' })
    )
  })
})
