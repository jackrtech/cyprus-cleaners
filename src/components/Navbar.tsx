'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/navigation'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import LanguageToggle from '@/components/layout/LanguageToggle'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { useHomeHref } from '@/hooks/useHomeHref'

interface NavbarProps {
  // Only meaningful when true: hides the whole header on mobile for a
  // logged-in visitor. Safe wherever BottomTabBar covers mobile nav instead
  // — since 2026-08-19 that's everywhere (BottomTabBar renders globally in
  // [locale]/layout.tsx, self-gating on session role), so every layout that
  // renders this Navbar passes it. Kept as an opt-in prop rather than
  // Navbar checking session role itself, so a future route group that
  // doesn't want BottomTabBar-as-mobile-nav can still opt out.
  hideOnMobileWhenLoggedIn?: boolean
}

export default function Navbar({ hideOnMobileWhenLoggedIn = false }: NavbarProps) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: session } = useSession()
  const role = session?.user?.role
  const isLoggedIn = !!session?.user
  const homeHref = useHomeHref()

  const roleLabel = role === 'CUSTOMER' ? t('roleCustomer')
    : role === 'CLEANER' ? t('roleCleaner')
    : role === 'ADMIN'   ? t('admin')
    : null

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' })
    setDrawerOpen(false)
  }

  // Nav centre links — vary by role. Admin has no link here: its only "nav
  // link" would point to the exact same place as the Dashboard button right
  // next to it, which is just a redundant duplicate entry.
  // CLEANER gets Bookings/Messages as real top-level links as of 2026-08-21
  // (Todoist "cleaner dashboard IA refactor", Phase 1 — minimal functional
  // update so desktop has a way to reach the new /dashboard/cleaner/bookings
  // and /dashboard/cleaner/messages routes; full nav polish, replacing the
  // "Dashboard" ghost-button language everywhere, is Phase 2).
  const navLinks: { label: string; href: string }[] = (() => {
    if (role === 'CUSTOMER') return [{ label: t('findCleaner'), href: '/dashboard/search' }]
    if (role === 'CLEANER')  return [
      { label: t('bookingsTab'), href: '/dashboard/cleaner/bookings' },
      { label: t('messagesTab'), href: '/dashboard/cleaner/messages' },
    ]
    if (role === 'ADMIN')    return []
    // Logged out / loading
    return [
      { label: t('findCleaner'), href: '/cleaners' },
      { label: t('forCleaners'), href: '/for-cleaners' },
    ]
  })()

  // Ghost button — always a link
  const ghostBtn = (() => {
    if (role === 'CUSTOMER') return { label: t('dashboard'), href: '/dashboard' }
    if (role === 'CLEANER')  return { label: t('homeTab'), href: '/dashboard/cleaner' }
    if (role === 'ADMIN')    return { label: t('dashboard'), href: '/admin' }
    return { label: t('signIn'), href: '/login' }
  })()

  const linkClass = (href: string) => {
    const active = href === '/cleaners'
      ? pathname.includes('/cleaners')
      : pathname === href
    return `text-[14px] transition-colors ${
      active
        ? 'text-[#19706A] font-medium border-b-2 border-[#19706A] pb-0.5'
        : 'text-[#0D1F1E] dark:text-[#ECF3F2] hover:text-[#19706A]'
    }`
  }

  return (
    // Wrapper is a plain `relative` positioning anchor for the mobile drawer
    // below — NOT a stacking context of its own (no z-index here), so the
    // drawer's z-[70] competes directly with page-level siblings like
    // FilterBar's sticky bar, instead of being capped at <header>'s z-50
    // (which it would be if it stayed nested inside <header>, since z-index
    // only ever resolves within the nearest ANCESTOR stacking context).
    <div className="relative">
      <header className={`sticky top-0 z-50 w-full bg-white dark:bg-[#16211F] border-b border-[#E0EDEC] dark:border-[#253634] ${isLoggedIn && hideOnMobileWhenLoggedIn ? 'hidden md:block' : ''}`}>
      <div className="px-6 lg:px-12 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href={homeHref} className="flex items-center gap-2.5 shrink-0">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#E8F4F3" />
            <path d="M22 10.5C22 10.5 19.5 8 16 8C11.582 8 8 11.582 8 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="8" cy="16" r="1.5" fill="#F2C94C" />
            <path d="M10 21.5C10 21.5 12.5 24 16 24C20.418 24 24 20.418 24 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="16" r="1.5" fill="#F2C94C" />
          </svg>
          <span className="text-[17px] font-medium text-[#19706A] tracking-tight">Cyprus Cleaners</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map(link => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn && session?.user?.name && (
            <span className="hidden lg:block text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] whitespace-nowrap">
              {session.user.name}
              {roleLabel && <span className="text-[#19706A] font-medium"> · {roleLabel}</span>}
            </span>
          )}
          <LanguageToggle />
          <ThemeToggle />
          <Link href={ghostBtn.href} className="btn-ghost">{ghostBtn.label}</Link>
          {isLoggedIn ? (
            <>
              <Link href="/dashboard/profile" className={linkClass('/dashboard/profile')}>{t('profileTab')}</Link>
              <button onClick={handleSignOut} className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors">{t('signOut')}</button>
            </>
          ) : (
            <Link href="/get-started" className="btn-primary">{t('getStarted')}</Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#0D1F1E] dark:text-[#ECF3F2] text-xl leading-none"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {drawerOpen ? '✕' : '☰'}
        </button>
      </div>
      </header>

      {/* Mobile drawer — each group gets a divider instead of relying on gap
          spacing alone, so an empty group (e.g. no nav links for a cleaner)
          can't leave a phantom blank row; text sizing is consistent (14px)
          across every plain row, leaving the Dashboard button as the one
          deliberately-emphasized action, same as it is on desktop. */}
      {drawerOpen && (
        // z-[70]: this had no explicit z-index before (just inherited the
        // header's z-50), so on any page with a sticky element above z-50 —
        // e.g. FilterBar's sticky filters bar at z-[60] on /cleaners — the
        // drawer rendered UNDER it instead of on top (2026-08-19 bug fix).
        <div className="md:hidden absolute top-full left-0 w-full z-[70] bg-white dark:bg-[#16211F] border-b border-[#E0EDEC] dark:border-[#253634] px-6 py-5 flex flex-col gap-4" style={{ boxShadow: '0 8px 24px rgba(25,112,106,0.08)' }}>
          {isLoggedIn && session?.user?.name && (
            <span className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">
              {session.user.name}
              {roleLabel && <span className="text-[13px] text-[#19706A] font-normal"> · {roleLabel}</span>}
            </span>
          )}

          {navLinks.length > 0 && (
            <div className="flex flex-col gap-3 pt-4 border-t border-[#E0EDEC] dark:border-[#253634]">
              {navLinks.map(link => (
                <Link key={link.href} href={link.href} className={linkClass(link.href)} onClick={() => setDrawerOpen(false)}>
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-[#E0EDEC] dark:border-[#253634]">
            <span className="text-[14px] text-[#0D1F1E] dark:text-[#ECF3F2]">{t('language')}</span>
            <LanguageToggle />
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-[#E0EDEC] dark:border-[#253634]">
            <Link href={ghostBtn.href} className="btn-ghost justify-center" onClick={() => setDrawerOpen(false)}>
              {ghostBtn.label}
            </Link>
            {isLoggedIn ? (
              <button onClick={handleSignOut} className="text-[14px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors text-center">{t('signOut')}</button>
            ) : (
              <Link href="/get-started" className="btn-primary justify-center" onClick={() => setDrawerOpen(false)}>
                {t('getStarted')}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
