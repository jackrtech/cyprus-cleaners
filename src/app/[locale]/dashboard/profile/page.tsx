'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import LanguageToggle from '@/components/layout/LanguageToggle'

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ProfilePage() {
  const { data: session, status: sessionStatus } = useSession()
  const t = useTranslations('dashboard')
  const tNav = useTranslations('nav')
  const router = useRouter()

  const [cleanerSlug, setCleanerSlug] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
  }, [session, sessionStatus, router])

  useEffect(() => {
    if (session?.user.role !== 'CLEANER') return
    fetch('/api/cleaner-profiles/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.slug) setCleanerSlug(d.slug) })
      .catch(() => {})
  }, [session])

  if (sessionStatus === 'loading' || !session) {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const role = session.user.role
  const roleLabel = role === 'CUSTOMER' ? tNav('roleCustomer')
    : role === 'CLEANER' ? tNav('roleCleaner')
    : tNav('admin')

  return (
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8 pb-tabbar md:pb-8">
      <div className="max-w-[720px] mx-auto space-y-6">
        <h1 className="text-[24px] font-medium text-[#0D1F1E]">{t('yourAccount')}</h1>

        <div className="card p-5 flex items-center gap-4">
          <div className="shrink-0 w-14 h-14 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[16px] font-medium">
            {getInitials(session.user.name ?? '')}
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-medium text-[#0D1F1E] truncate">{session.user.name}</p>
            <p className="text-[13px] text-[#6B8886] truncate">{session.user.email}</p>
            <span className="inline-block mt-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#E8F4F3] text-[#19706A]">
              {roleLabel}
            </span>
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between gap-3">
          <span className="text-[14px] text-[#0D1F1E]">{tNav('language')}</span>
          <LanguageToggle />
        </div>

        {role === 'CLEANER' && (
          <div className="card divide-y divide-[#E0EDEC]">
            <Link href="/dashboard/cleaner/edit" className="flex items-center justify-between px-5 py-4 hover:bg-[#F7FAF9] transition-colors">
              <span className="text-[14px] text-[#0D1F1E]">{t('editProfile')}</span>
              <span className="text-[#6B8886]" aria-hidden="true">›</span>
            </Link>
            {cleanerSlug && (
              <Link href={`/cleaners/${cleanerSlug}`} className="flex items-center justify-between px-5 py-4 hover:bg-[#F7FAF9] transition-colors">
                <span className="text-[14px] text-[#0D1F1E]">{t('viewPublicProfile')}</span>
                <span className="text-[#6B8886]" aria-hidden="true">›</span>
              </Link>
            )}
          </div>
        )}

        <div className="text-center pt-2">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-[13px] text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
          >
            {t('signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}
