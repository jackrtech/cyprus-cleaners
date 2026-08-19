'use client'

import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/navigation'

type IconProps = { active: boolean }

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={active ? '#19706A' : '#5B7472'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5L11 3l8 7.5" />
      <path d="M5.5 8.5V18a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8.5" />
    </svg>
  )
}

function SearchIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={active ? '#19706A' : '#5B7472'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9.5" cy="9.5" r="6" />
      <path d="M18 18l-4.35-4.35" />
    </svg>
  )
}

function BookingsIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={active ? '#19706A' : '#5B7472'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="15" height="14" rx="2" />
      <path d="M3.5 9h15M7 2.5v3M15 2.5v3" />
    </svg>
  )
}

function MessagesIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={active ? '#19706A' : '#5B7472'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 5a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 18.5 5v9a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H5A1.5 1.5 0 0 1 3.5 14z" />
    </svg>
  )
}

function ProfileIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={active ? '#19706A' : '#5B7472'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="7" r="3.5" />
      <path d="M3.5 19c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  )
}

export default function BottomTabBar() {
  return (
    <Suspense fallback={null}>
      <BottomTabBarInner />
    </Suspense>
  )
}

function BottomTabBarInner() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session } = useSession()

  const role = session?.user?.role
  if (role !== 'CUSTOMER' && role !== 'CLEANER') return null

  const dashboardRoot = role === 'CLEANER' ? '/dashboard/cleaner' : '/dashboard'
  const tabParam = searchParams.get('tab')
  const onDashboardRoot = pathname === dashboardRoot

  // Home and Bookings both land on the dashboard root — it already shows
  // the bookings list by default (see dashboard/page.tsx's activeTab logic)
  // — so there's no separate "overview" screen to send Home to. They're
  // told apart by URL only: Home always navigates to the bare root (no
  // ?tab), Bookings always sets ?tab=bookings explicitly, and each tab only
  // lights up for the query shape its own link produces.
  const tabs = [
    {
      key: 'home',
      label: t('homeTab'),
      href: dashboardRoot,
      active: onDashboardRoot && tabParam === null,
      Icon: HomeIcon,
    },
    {
      key: 'search',
      label: t('searchTab'),
      href: '/dashboard/search',
      active: pathname.startsWith('/dashboard/search'),
      Icon: SearchIcon,
    },
    {
      key: 'bookings',
      label: t('bookingsTab'),
      href: `${dashboardRoot}?tab=bookings`,
      active: onDashboardRoot && tabParam === 'bookings',
      Icon: BookingsIcon,
    },
    {
      key: 'messages',
      label: t('messagesTab'),
      href: `${dashboardRoot}?tab=messages`,
      active: onDashboardRoot && tabParam === 'messages',
      Icon: MessagesIcon,
    },
    {
      key: 'profile',
      label: t('profileTab'),
      href: '/dashboard/profile',
      active: pathname === '/dashboard/profile',
      Icon: ProfileIcon,
    },
  ] as const

  return (
    <>
      <nav
        aria-label={t('primaryNavigation')}
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-[#16211F] border-t border-[#E0EDEC] dark:border-[#253634] flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ key, label, href, active, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5"
          >
            <Icon active={active} />
            <span className={`text-[11px] leading-none ${active ? 'text-[#19706A] font-medium' : 'text-[#5B7472] dark:text-[#9BB0AE]'}`}>
              {label}
            </span>
          </Link>
        ))}
      </nav>
      {/* The nav above is `fixed`, so it reserves no space of its own. This
          is the very last element in <body> (rendered globally, see
          [locale]/layout.tsx) purely to occupy that space in normal flow —
          it pushes the true bottom of every page down by the bar's height so
          nothing (a footer link, a form's submit button) ends up hidden
          under it, on every route, without every page opting in individually. */}
      <div className="md:hidden" style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }} />
    </>
  )
}
