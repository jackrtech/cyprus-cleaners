'use client'

import { useSession } from 'next-auth/react'

// Where "Home" should point for the current visitor — the marketing
// homepage when logged out, or the signed-in user's own app home when
// logged in (matching (app)/layout.tsx's homeForRole, duplicated here since
// that one is scoped to a 'use client' layout, not an importable helper).
// Used anywhere a hardcoded href="/" would otherwise send a signed-in user
// back to the marketing page: the navbar logo, the 404 page, and the
// cleaners-directory/profile breadcrumbs (shared between the marketing
// /cleaners route and the app-native /dashboard/search route).
export function useHomeHref(): string {
  const { data: session } = useSession()
  const role = session?.user?.role
  if (role === 'ADMIN') return '/admin'
  if (role === 'CLEANER') return '/dashboard/cleaner'
  if (role === 'CUSTOMER') return '/dashboard'
  return '/'
}
