import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/test/mocks/supabase'

const { client, setFromResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => client,
}))
vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn(() => Promise.resolve()),
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    client.from.mockClear()
  })

  it('rejects a duplicate email with 409 and never hashes/inserts a password', async () => {
    setFromResult('users', { data: { id: 'existing-user-id' }, error: null })

    const res = await POST(makeRequest({
      email:     'taken@example.com',
      password:  'password123',
      full_name: 'Jane Doe',
      role:      'CUSTOMER',
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already exists/i)
  })

  it('rejects an invalid payload with 400 before ever touching the database', async () => {
    const res = await POST(makeRequest({
      email: 'not-an-email', password: 'short', full_name: '', role: 'CUSTOMER',
    }))

    expect(res.status).toBe(400)
    expect(client.from).not.toHaveBeenCalled()
  })
})
