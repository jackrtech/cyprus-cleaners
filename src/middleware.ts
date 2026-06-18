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

        // Cleaner dashboard — CLEANER only
        if (pathname.startsWith('/cleaner/dashboard')) {
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protected paths go through auth middleware
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/cleaner/dashboard') ||
    pathname.startsWith('/admin')

  if (isProtected) {
    return (authMiddleware as (req: NextRequest) => Response)(req)
  }

  // Everything else just goes through i18n
  return intlMiddleware(req)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
}
