'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import Footer from '@/components/Footer'
import { useHomeHref } from '@/hooks/useHomeHref'

export default function NotFound() {
  const t = useTranslations('notFound')
  const homeHref = useHomeHref()

  return (
    <>
      <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] flex items-center justify-center px-4 py-20">
        <div className="max-w-[420px] text-center">
          <p className="text-[64px] font-medium text-[#19706A] leading-none mb-4">404</p>
          <h1 className="text-[22px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-2">{t('title')}</h1>
          <p className="text-[14px] text-[#5B7472] dark:text-[#9BB0AE] mb-8">{t('body')}</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href={homeHref} className="btn-primary !px-5 !py-2.5 rounded-full text-[14px]">
              {t('goHome')}
            </Link>
            <Link href="/cleaners" className="btn-ghost !px-5 !py-2.5 rounded-full text-[14px]">
              {t('findACleaner')}
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
