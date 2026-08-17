'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/navigation'

const TABS = [
  { href: '/admin', labelKey: 'navVerifications' },
  { href: '/admin/disputes', labelKey: 'navDisputes' },
  { href: '/admin/cancellations', labelKey: 'navCancellations' },
  { href: '/admin/users', labelKey: 'navUsers' },
] as const

export default function AdminNav() {
  const t = useTranslations('admin')
  const pathname = usePathname()

  return (
    <nav className="flex gap-2 mb-6 border-b border-border dark:border-[#253634]">
      {TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2 text-body font-medium border-b-2 transition-colors ${
              active
                ? 'border-teal-500 text-teal-900 dark:text-[#ECF3F2]'
                : 'border-transparent text-muted dark:text-[#9BB0AE] hover:text-teal-900 dark:hover:text-[#ECF3F2]'
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
