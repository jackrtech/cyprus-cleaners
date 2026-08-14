import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/test/mocks/supabase'

const { client, setFromResult, queueFromResults } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => client,
}))
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))

import { getServerSession } from 'next-auth/next'
import { POST } from './route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

function mockSession(userId: string, role = 'CUSTOMER') {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, email: 'x@example.com', name: 'X', role, avatar_url: null },
  } as never)
}

describe('POST /api/reviews', () => {
  beforeEach(() => {
    client.from.mockClear()
  })

  it('rejects a review on a non-completed booking with 409', async () => {
    mockSession('customer-1')
    setFromResult('bookings', {
      data: { id: 'booking-1', customer_id: 'customer-1', cleaner_profile_id: 'cleaner-1', status: 'CONFIRMED' },
      error: null,
    })

    const res = await POST(makeRequest({ booking_id: 'booking-1', rating: 5 }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/completed booking/i)
  })

  it('rejects reviewing a booking that belongs to another customer with 403', async () => {
    mockSession('customer-1')
    setFromResult('bookings', {
      data: { id: 'booking-1', customer_id: 'someone-else', cleaner_profile_id: 'cleaner-1', status: 'COMPLETED' },
      error: null,
    })

    const res = await POST(makeRequest({ booking_id: 'booking-1', rating: 5 }))

    expect(res.status).toBe(403)
  })

  it('allows a review on a COMPLETED booking owned by the caller', async () => {
    mockSession('customer-1')
    setFromResult('bookings', {
      data: { id: 'booking-1', customer_id: 'customer-1', cleaner_profile_id: 'cleaner-1', status: 'COMPLETED' },
      error: null,
    })
    queueFromResults('reviews',
      { data: null, error: null }, // existence check: no review yet
      { data: { id: 'review-1', booking_id: 'booking-1', rating: 5, body: null, created_at: '2026-01-01' }, error: null } // insert result
    )

    const res = await POST(makeRequest({ booking_id: 'booking-1', rating: 5 }))

    expect(res.status).toBe(201)
  })
})
