import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { createMockSupabaseClient } from '@/test/mocks/supabase'

const { client, setFromResult } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => client,
}))

import { authOptions } from './config'

type Credentials = { email: string; password: string }
type AuthorizeFn = (credentials: Credentials | undefined) => Promise<unknown>

// CredentialsProvider(config) returns { id, type, authorize: () => null, options: config }
// — the default `authorize` on the object itself is a no-op stub; NextAuth's
// internal runtime is what actually swaps in `options.authorize`, so the real
// implementation has to be reached through `.options` here.
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } }).options.authorize

const HASHED_PASSWORD = bcrypt.hashSync('correct-password', 10)
const DB_USER = {
  id: 'user-1',
  email: 'user@example.com',
  full_name: 'Test User',
  password_hash: HASHED_PASSWORD,
  role: 'CUSTOMER',
  avatar_url: null,
}

describe('authorize (NextAuth credentials provider)', () => {
  beforeEach(() => {
    client.from.mockClear()
  })

  it('returns null for a wrong password', async () => {
    setFromResult('users', { data: DB_USER, error: null })

    const result = await authorize({ email: 'user@example.com', password: 'wrong-password' })

    expect(result).toBeNull()
  })

  it('returns the user for the correct password', async () => {
    setFromResult('users', { data: DB_USER, error: null })

    const result = await authorize({ email: 'user@example.com', password: 'correct-password' })

    expect(result).toMatchObject({ id: 'user-1', email: 'user@example.com', role: 'CUSTOMER' })
  })

  it('returns null when no user matches the email', async () => {
    setFromResult('users', { data: null, error: { message: 'not found' } })

    const result = await authorize({ email: 'nobody@example.com', password: 'anything' })

    expect(result).toBeNull()
  })
})
