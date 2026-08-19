'use client'

import { useTransition } from 'react'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/navigation'
import type { Locale } from '@/navigation'

export default function LanguageToggle() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Switching locale re-renders everything under [locale]/layout.tsx from
  // the server (messages, session-derived copy, etc.), which without this
  // wrapper immediately falls back to [locale]/loading.tsx's full-screen
  // spinner — the whole page (nav included) blanks out, reads as a hard
  // reload, and resets any local UI state (e.g. the mobile nav drawer)
  // the instant that happens. startTransition keeps the current page
  // mounted and interactive while the new locale's RSC payload streams in,
  // swapping only once it's ready — the same content just re-renders in
  // place instead of vanishing first (bug reported 2026-08-19).
  const handleLocaleSwitch = (targetLocale: Locale) => {
    startTransition(() => {
      // scroll: false — this is the same page, just re-rendered in the new
      // locale; jumping back to the top would be its own jarring surprise
      // if the visitor switches language partway down a long page.
      router.push(pathname, { locale: targetLocale, scroll: false })
    })
  }

  return (
    <div className={`flex items-center bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] rounded-full p-0.5 gap-0.5 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
      {(['en', 'el'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => handleLocaleSwitch(lang)}
          disabled={isPending}
          className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full transition-all ${
            locale === lang
              ? 'bg-[#19706A] text-white'
              : 'text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2]'
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
