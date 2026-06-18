'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'

export default function HomePage() {
  const tNav = useTranslations('nav')
  const tHome = useTranslations('home')

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-h1 text-teal-900 mb-4">Cyprus Cleaners</h1>
        <p className="text-body text-muted mb-8">
          {tHome('hero.subheadline')}
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/register" className="btn-primary">{tNav('getStarted')}</Link>
          <Link href="/cleaners" className="btn-secondary">{tHome('hero.cta')}</Link>
        </div>
      </div>
    </main>
  )
}
