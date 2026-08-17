'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { Link } from '@/navigation'
import type { Locale } from '@/navigation'

export default function Footer() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const handleLocaleSwitch = (targetLocale: Locale) => {
    router.push(pathname, { locale: targetLocale })
  }

  return (
    <footer className="bg-[#0D1F1E] dark:bg-[#ECF3F2] text-white">
      <div className="px-4 md:px-12 py-8 md:py-16">
        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-12">

          {/* Col 1 — Brand */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#1A3634" />
                <path d="M22 10.5C22 10.5 19.5 8 16 8C11.582 8 8 11.582 8 16" stroke="#E8F4F3" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="8" cy="16" r="1.5" fill="#F2C94C" />
                <path d="M10 21.5C10 21.5 12.5 24 16 24C20.418 24 24 20.418 24 16" stroke="#E8F4F3" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="24" cy="16" r="1.5" fill="#F2C94C" />
              </svg>
              <span className="text-white text-[15px] md:text-[17px] font-medium">Cyprus Cleaners</span>
            </div>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] leading-relaxed max-w-[220px]">
              Connecting Cyprus homes with trusted local cleaners.
            </p>
          </div>

          {/* Col 2 — Links (just the two that matter, no headers needed) */}
          <div className="flex gap-6">
            <Link href="/#how-it-works" className="text-[13px] md:text-[14px] text-[#B4B2A9] dark:text-[#8C8A80] hover:text-white transition-colors">
              How it works
            </Link>
            <Link href="/faq" className="text-[13px] md:text-[14px] text-[#B4B2A9] dark:text-[#8C8A80] hover:text-white transition-colors">
              FAQ
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 mt-5 md:mt-12 pt-4 md:pt-6 flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[11px] md:text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
              © 2025 Cyprus Cleaners. All rights reserved.
            </p>
            <Link href="/privacy" className="text-[11px] md:text-[12px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-[11px] md:text-[12px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-white transition-colors">
              Terms of Service
            </Link>
          </div>

          {/* Dark locale toggle */}
          <div className="flex items-center bg-white/10 rounded-full p-0.5 gap-0.5">
            {(['en', 'el'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => handleLocaleSwitch(lang)}
                className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full transition-all ${
                  locale === lang
                    ? 'bg-white/20 text-white'
                    : 'text-[#5B7472] dark:text-[#9BB0AE] hover:text-white'
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
