import { withAuth } from 'next-auth/middleware'
import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import type { UserRole } from '@/types'

const LOCALES = ['en', 'el'] as const

const intlMiddleware = createIntlMiddleware({
  locales: LOCALES,
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /el/ prefix for Greek; English at root
})

// The route-protection checks below match against unprefixed paths
// ('/dashboard', '/admin') — with localePrefix 'as-needed', a Greek URL is
// '/el/dashboard', which a raw pathname.startsWith('/dashboard') would miss
// entirely, skipping the auth check for that locale. Strip the locale
// prefix before doing any protection check so English and Greek URLs are
// gated identically.
function stripLocalePrefix(pathname: string): string {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1) || '/'
    }
  }
  return pathname
}

// The inverse of the above, for rebuilding a redirect target — 'en' is the
// default locale and unprefixed under localePrefix 'as-needed', so only a
// non-default locale prefix needs preserving.
function getLocalePrefix(pathname: string): string {
  for (const locale of LOCALES) {
    if (locale === 'en') continue
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) return `/${locale}`
  }
  return ''
}

function homeForRole(role: UserRole | undefined): string {
  if (role === 'ADMIN') return '/admin'
  if (role === 'CLEANER') return '/dashboard/cleaner'
  return '/dashboard'
}

const authMiddleware = withAuth(
  function onSuccess(req) {
    return intlMiddleware(req)
  },
  {
    callbacks: {
      authorized({ token, req }) {
        const pathname = stripLocalePrefix(req.nextUrl.pathname)

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // API routes bypass i18n/auth-page middleware entirely (unchanged from
  // before) — only the rate-limit check above applies to them.
  if (pathname.startsWith('/api')) {
    if (isRateLimited(req)) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
    }
    return NextResponse.next()
  }

  const strippedPathname = stripLocalePrefix(pathname)

  // Marketing homepage is logged-out-only — a signed-in visitor lands on
  // their own role's app home instead. Checked separately from isProtected
  // below since '/' isn't itself a protected route (no role requirement,
  // just not the marketing page once authenticated).
  if (strippedPathname === '/') {
    const token = await getToken({ req })
    if (token) {
      const target = getLocalePrefix(pathname) + homeForRole(token.role)
      return NextResponse.redirect(new URL(target, req.url))
    }
  }

  // Protected paths go through auth middleware
  const isProtected =
    strippedPathname.startsWith('/dashboard') ||
    strippedPathname.startsWith('/admin')

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
