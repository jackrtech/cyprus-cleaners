'use client'

import { useTranslations } from 'next-intl'

export function useCity() {
  const t = useTranslations('cities')
  return (city: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { return t(city as any) } catch { return city }
  }
}
