'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Link, useRouter, usePathname } from '@/navigation'
import type { Locale } from '@/navigation'
import { useState } from 'react'

export default function Navbar() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const pathname = usePathname() // locale-neutral path from next-intl
  const router = useRouter()     // next-intl router — locale-aware push
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isCleanersActive = pathname.includes('/cleaners')

  const handleLocaleSwitch = (targetLocale: Locale) => {
    router.push(pathname, { locale: targetLocale })
  }

  const NavLinks = () => (
    <>
      <Link
        href="/cleaners"
        className={`text-[14px] transition-colors ${
          isCleanersActive
            ? 'text-[#19706A] font-medium border-b-2 border-[#19706A] pb-0.5'
            : 'text-[#0D1F1E] hover:text-[#19706A]'
        }`}
      >
        {t('findCleaner')}
      </Link>
      <Link
        href="/register?role=cleaner"
        className="text-[14px] text-[#0D1F1E] hover:text-[#19706A] transition-colors"
      >
        {t('forCleaners')}
      </Link>
    </>
  )

  const LanguageToggle = () => (
    <div className="flex items-center bg-[#F7FAF9] border border-[#E0EDEC] rounded-full p-0.5 gap-0.5">
      {(['en', 'el'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => handleLocaleSwitch(lang)}
          className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full transition-all ${
            locale === lang
              ? 'bg-[#19706A] text-white'
              : 'text-[#6B8886] hover:text-[#0D1F1E]'
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-[#E0EDEC]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
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
          <NavLinks />
        </nav>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageToggle />
          <Link href="/login" className="btn-ghost">{t('signIn')}</Link>
          <Link href="/register" className="btn-primary">{t('getStarted')}</Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#0D1F1E] text-xl leading-none"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {drawerOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-[#F7FAF9] border-b border-[#E0EDEC] px-6 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <NavLinks />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[14px] text-[#0D1F1E]">{t('language')}</span>
            <LanguageToggle />
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="btn-ghost flex-1 justify-center" onClick={() => setDrawerOpen(false)}>
              {t('signIn')}
            </Link>
            <Link href="/register" className="btn-primary flex-1 justify-center" onClick={() => setDrawerOpen(false)}>
              {t('getStarted')}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
