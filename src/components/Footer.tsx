'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { Link } from '@/navigation'
import type { Locale } from '@/navigation'

const CITIES = [
  'Nicosia', 'Limassol', 'Larnaca', 'Paphos',
  'Famagusta', 'Paralimni', 'Ayia Napa', 'Kyrenia',
]

export default function Footer() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const handleLocaleSwitch = (targetLocale: Locale) => {
    router.push(pathname, { locale: targetLocale })
  }

  return (
    <footer className="bg-[#0D1F1E] text-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        {/* Three-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

          {/* Col 1 — Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#1A3634" />
                <path d="M22 10.5C22 10.5 19.5 8 16 8C11.582 8 8 11.582 8 16" stroke="#E8F4F3" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="8" cy="16" r="1.5" fill="#F2C94C" />
                <path d="M10 21.5C10 21.5 12.5 24 16 24C20.418 24 24 20.418 24 16" stroke="#E8F4F3" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="24" cy="16" r="1.5" fill="#F2C94C" />
              </svg>
              <span className="text-white text-[17px] font-medium">Cyprus Cleaners</span>
            </div>
            <p className="text-[14px] text-[#6B8886] leading-relaxed max-w-[220px]">
              Connecting Cyprus homes with trusted local cleaners.
            </p>
          </div>

          {/* Col 2 — Links */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-[11px] font-medium text-[#6B8886] tracking-[0.07em] uppercase mb-4">
                For customers
              </p>
              <ul className="space-y-3">
                {[
                  { label: 'Find a cleaner', href: '/cleaners' },
                  { label: 'How it works',   href: '#how-it-works' },
                  { label: 'Cities',         href: '/cities' },
                ].map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[14px] text-[#B4B2A9] hover:text-white transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#6B8886] tracking-[0.07em] uppercase mb-4">
                For cleaners
              </p>
              <ul className="space-y-3">
                {[
                  { label: 'Join as a cleaner', href: '/register?role=cleaner' },
                  { label: 'How it works',      href: '#how-it-works' },
                  { label: 'FAQ',               href: '/faq' },
                ].map(l => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[14px] text-[#B4B2A9] hover:text-white transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Col 3 — Cities */}
          <div>
            <p className="text-[11px] font-medium text-[#6B8886] tracking-[0.07em] uppercase mb-4">
              Cities we serve
            </p>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              {CITIES.map(city => (
                <span
                  key={city}
                  className="text-[12px] text-[#6B8886] hover:text-white cursor-pointer transition-colors"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 mt-12 pt-6 flex justify-between items-center flex-wrap gap-4">
          <p className="text-[12px] text-[#6B8886]">
            © 2025 Cyprus Cleaners. All rights reserved.
          </p>

          {/* Dark locale toggle */}
          <div className="flex items-center bg-white/10 rounded-full p-0.5 gap-0.5">
            {(['en', 'el'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => handleLocaleSwitch(lang)}
                className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full transition-all ${
                  locale === lang
                    ? 'bg-white/20 text-white'
                    : 'text-[#6B8886] hover:text-white'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
