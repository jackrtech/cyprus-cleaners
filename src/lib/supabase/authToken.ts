import { SignJWT } from 'jose'

// NextAuth (JWT sessions) is the only auth mechanism in this app — there is no
// Supabase Auth session, so Postgres RLS policies that check auth.uid() never
// resolve for requests made with the bare anon key. This mints a short-lived,
// Supabase-compatible access token (signed with the project's legacy JWT
// secret) carrying the NextAuth user id as `sub`, so the browser Supabase
// client can attach it and have auth.uid() resolve correctly for RLS.
export async function signSupabaseAccessToken(userId: string): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set')

  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret))
}
