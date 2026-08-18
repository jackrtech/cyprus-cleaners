'use client'

import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'theme'

function getStoredOrSystemTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fall through to system preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

// Mirrors the inline no-flash script in the root layout, which sets the
// same class synchronously before hydration — this just keeps React's
// state in sync with it and exposes a way to change it.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = getStoredOrSystemTheme()
    setTheme(stored)
    // The inline no-flash script in the root layout only runs once, on the
    // very first hard page load — it does not re-run when a locale switch
    // remounts the root layout's <html> tree client-side (root layout lives
    // under the [locale] dynamic segment), which was silently dropping the
    // `dark` class while localStorage still correctly said 'dark'. Applying
    // it here too makes every mount of this hook self-correcting.
    applyTheme(stored)
    setMounted(true)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore — theme just won't persist across reloads
      }
      return next
    })
  }, [])

  return { theme, toggleTheme, mounted }
}
