import { createSharedPathnamesNavigation } from 'next-intl/navigation'

export const locales = ['en', 'el'] as const
export type Locale = (typeof locales)[number]

export const { Link, useRouter, usePathname, redirect, permanentRedirect } =
  createSharedPathnamesNavigation({
    locales,
    localePrefix: 'as-needed',
  })
