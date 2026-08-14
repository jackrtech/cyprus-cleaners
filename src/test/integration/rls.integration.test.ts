// Real-database RLS integration tests. Unlike the rest of the suite, these
// hit the live Supabase project directly (no mocked client) using the two
// real accounts (jack/sasha) to prove the actual Postgres RLS policies in
// supabase/schema.sql behave as documented — a mocked Supabase client can't
// verify RLS, since RLS is enforced by Postgres itself, not application code.
//
// Run via `npm run test:integration` (see vitest.integration.config.ts) —
// deliberately excluded from the default `npm test` / pre-push run since it
// depends on network + .env.local, not just on the repo's own source.
// Skips itself entirely if live credentials aren't present.
import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const ENV_LOCAL_PATH = path.join(ROOT, '.env.local')

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return
  const lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvLocal()

const JACK_EMAIL = 'jackrowsell@gmail.com'
const SASHA_EMAIL = 'sashanizkaya@gmail.com'
// Syntactically valid UUID that (barring astronomical coincidence) never
// corresponds to a real user — used to prove RLS denies a party-less
// identity, without needing a second real thread or account to exist.
const OUTSIDER_ID = '00000000-0000-0000-0000-000000000000'

const hasLiveCreds = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_JWT_SECRET
)

async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))
}

function clientAs(token?: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    }
  )
}

describe.skipIf(!hasLiveCreds)('RLS policies (live DB)', () => {
  let admin: SupabaseClient
  let jackId: string
  let sashaId: string
  let jackClient: SupabaseClient
  let outsiderClient: SupabaseClient
  let jackProfileId: string
  let jackOriginalStatus: string | null = null

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: jack } = await admin.from('users').select('id').eq('email', JACK_EMAIL).single()
    const { data: sasha } = await admin.from('users').select('id').eq('email', SASHA_EMAIL).single()
    if (!jack || !sasha) {
      throw new Error(`Real accounts not found (${JACK_EMAIL} / ${SASHA_EMAIL}) — cannot run live RLS tests.`)
    }
    jackId = jack.id
    sashaId = sasha.id

    const { data: jackProfile } = await admin
      .from('cleaner_profiles')
      .select('id')
      .eq('user_id', jackId)
      .single()
    if (!jackProfile) throw new Error('Jack has no cleaner_profiles row.')
    jackProfileId = jackProfile.id

    jackClient = clientAs(await signAccessToken(jackId))
    outsiderClient = clientAs(await signAccessToken(OUTSIDER_ID))
  })

  it("a user cannot read another user's addresses", async () => {
    const { data: sashaOwnRows } = await admin.from('addresses').select('id').eq('user_id', sashaId)
    if (!sashaOwnRows || sashaOwnRows.length === 0) {
      throw new Error('Sasha has no seeded addresses — run `npm run seed` first.')
    }

    const { data, error } = await jackClient.from('addresses').select('id').eq('user_id', sashaId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('an identity with no relation to a thread cannot read its messages', async () => {
    const { data: intro } = await admin
      .from('introductions')
      .select('id')
      .eq('customer_id', sashaId)
      .eq('cleaner_profile_id', jackProfileId)
      .single()
    if (!intro) throw new Error('No jack<->sasha introduction found — run `npm run seed` first.')

    // Positive control: jack, a genuine party, can read the thread — proves
    // the negative result below is RLS denying access, not just an empty table.
    const { data: asParty, error: partyError } = await jackClient
      .from('messages')
      .select('id')
      .eq('introduction_id', intro.id)
    expect(partyError).toBeNull()
    expect((asParty ?? []).length).toBeGreaterThan(0)

    const { data: asOutsider, error: outsiderError } = await outsiderClient
      .from('messages')
      .select('id')
      .eq('introduction_id', intro.id)
    expect(outsiderError).toBeNull()
    expect(asOutsider).toEqual([])
  })

  it('an inactive cleaner profile is not publicly selectable', async () => {
    const { data: profile } = await admin
      .from('cleaner_profiles')
      .select('id, status')
      .eq('user_id', jackId)
      .single()
    if (!profile) throw new Error('Jack has no cleaner_profiles row.')

    jackProfileId = profile.id
    jackOriginalStatus = profile.status
    try {
      await admin.from('cleaner_profiles').update({ status: 'PAUSED' }).eq('id', profile.id)

      const { data, error } = await clientAs().from('cleaner_profiles').select('id').eq('id', profile.id)
      expect(error).toBeNull()
      expect(data).toEqual([])
    } finally {
      await admin.from('cleaner_profiles').update({ status: jackOriginalStatus }).eq('id', profile.id)
      jackOriginalStatus = null
    }
  })

  afterAll(async () => {
    // Belt-and-braces: if the test above threw before its own finally ran,
    // put jack's profile status back to exactly what it was beforehand.
    if (jackOriginalStatus && jackProfileId) {
      await admin.from('cleaner_profiles').update({ status: jackOriginalStatus }).eq('id', jackProfileId)
    }
  })
})
