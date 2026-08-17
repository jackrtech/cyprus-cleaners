import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Server Component — cookie writes ignored
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Server Component — cookie writes ignored
          }
        },
      },
    }
  )
}

// Admin client — bypasses RLS for server-side operations
// NEVER expose this to the browser
//
// Explicit no-store fetch: supabase-js's internal fetch calls aren't
// reliably covered by a route's `dynamic = 'force-dynamic'` — that config
// only patches fetches Next.js can see directly in route source, not calls
// made inside a third-party library. Without this, Next.js's Data Cache can
// silently cache a GET response (e.g. a cleaner_profiles lookup) and keep
// serving it after the underlying row changes, even though a fresh direct
// query (or the browser's own fetch to this route) shows the current data.
export function createAdminClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}
