import { createBrowserClient } from '@supabase/ssr'

// Pass the token from GET /api/supabase-token to authenticate this client as
// the current NextAuth user, so RLS policies checking auth.uid() resolve —
// see src/lib/supabase/authToken.ts for why this is necessary.
export function createClient(accessToken?: string) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : undefined
  )
}
