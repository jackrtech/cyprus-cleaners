'use client'

import { useTranslations } from 'next-intl'
import { useTheme } from '@/hooks/useTheme'

export default function ThemeToggle() {
  const t = useTranslations('common')
  const { theme, toggleTheme, mounted } = useTheme()

  // Avoid rendering the wrong icon for a flash before the client theme is
  // known — render nothing (not a guess) until mounted resolves it.
  if (!mounted) {
    return <div className="w-9 h-9" aria-hidden="true" />
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? t('switchToLightMode') : t('switchToDarkMode')}
      className="flex items-center justify-center w-9 h-9 rounded-full text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] hover:bg-[#F7FAF9] dark:hover:bg-[#17302D] transition-colors"
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
