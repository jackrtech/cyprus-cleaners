'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from '@/navigation'
import Navbar from '@/components/Navbar'
import BottomTabBar from '@/components/layout/BottomTabBar'
import type { UserRole } from '@/types'

// middleware.ts already enforces the real security boundary (ADMIN-only on
// /admin/**, CLEANER-only on /dashboard/cleaner/**, any authenticated user
// on the rest of /dashboard/**) — an unauthenticated or wrong-role request
// never reaches this layout's client code. What's left here is purely
// belt-and-suspenders: the brief window before useSession() resolves
// client-side, and cross-dashboard redirects (e.g. a CLEANER hitting the
// customer /dashboard root) that aren't a security boundary, just routing
// a signed-in user to the page meant for their role.
function requiredRoleFor(pathname: string): UserRole | null {
  if (pathname.startsWith('/admin')) return 'ADMIN'
  if (pathname.startsWith('/dashboard/cleaner')) return 'CLEANER'
  return null
}

function homeForRole(role: UserRole): string {
  if (role === 'ADMIN') return '/admin'
  if (role === 'CLEANER') return '/dashboard/cleaner'
  return '/dashboard'
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  const requiredRole = requiredRoleFor(pathname)
  const cleanerOnCustomerHome = pathname === '/dashboard' && session?.user.role === 'CLEANER'

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (cleanerOnCustomerHome) { router.replace('/dashboard/cleaner'); return }
    if (requiredRole && session.user.role !== requiredRole) router.replace(homeForRole(session.user.role))
  }, [session, sessionStatus, pathname, requiredRole, cleanerOnCustomerHome, router])

  const blocked =
    sessionStatus === 'loading' ||
    !session ||
    cleanerOnCustomerHome ||
    (requiredRole !== null && session.user.role !== requiredRole)

  return (
    <>
      <Navbar />
      <main id="main-content">
        {blocked ? <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817]" /> : children}
      </main>
      <BottomTabBar />
    </>
  )
}
