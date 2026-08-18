import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'

const intlMiddleware = createIntlMiddleware({
  locales: ['en', 'el'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /el/ prefix for Greek; English at root
})

const authMiddleware = withAuth(
  function onSuccess(req) {
    return intlMiddleware(req)
  },
  {
    callbacks: {
      authorized({ token, req }) {
        const { pathname } = req.nextUrl

        // Admin routes — ADMIN only
        if (pathname.startsWith('/admin')) {
          return token?.role === 'ADMIN'
        }

        // Cleaner dashboard — CLEANER only (must be checked before /dashboard/**)
        if (pathname.startsWith('/dashboard/cleaner')) {
          return token?.role === 'CLEANER'
        }

        // Customer dashboard — any authenticated user
        if (pathname.startsWith('/dashboard')) {
          return !!token
        }

        return true
      },
    },
  }
)

// Best-effort rate limiting for auth-sensitive API routes. This is per-instance
// in-memory state — it resets on cold start and is NOT shared across Vercel's
// regions/instances, so it only blunts casual/single-instance abuse. For real
// production protection, also enable Vercel's Firewall rate-limiting rules
// (dashboard-configured, no code) or move this to a shared store (Upstash).
const RATE_LIMITED_PREFIXES = [
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/resend-verification',
  '/api/auth/reset-password',
  '/api/auth/validate-reset-token',
  '/api/auth/verify-email',
  '/api/auth/callback/credentials', // NextAuth credentials sign-in
  '/api/contact', // public, unauthenticated form — otherwise open to spam
]

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const rateLimitHits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(req: NextRequest): boolean {
  const { pathname } = req.nextUrl
  if (!RATE_LIMITED_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false

  const now = Date.now()

  // Opportunistic cleanup so the map doesn't grow unbounded on a long-lived instance
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitHits) {
      if (now > v.resetAt) rateLimitHits.delete(k)
    }
  }

  const ip = req.ip ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const key = `${ip}:${pathname}`
  const entry = rateLimitHits.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitHits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // API routes bypass i18n/auth-page middleware entirely (unchanged from
  // before) — only the rate-limit check above applies to them.
  if (pathname.startsWith('/api')) {
    if (isRateLimited(req)) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
    }
    return NextResponse.next()
  }

  // Protected paths go through auth middleware
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin')

  if (isProtected) {
    return (authMiddleware as (req: NextRequest) => Response)(req)
  }

  // Everything else just goes through i18n
  return intlMiddleware(req)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
}
