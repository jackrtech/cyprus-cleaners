'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/navigation'
import type { Locale } from '@/navigation'

export default function LanguageToggle() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const handleLocaleSwitch = (targetLocale: Locale) => {
    router.push(pathname, { locale: targetLocale })
  }

  return (
    <div className="flex items-center bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] rounded-full p-0.5 gap-0.5">
      {(['en', 'el'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => handleLocaleSwitch(lang)}
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
