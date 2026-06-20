'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter } from '@/navigation'

interface CleanerProfile {
  display_name: string
  photo_url:    string | null
  cities:       string[] | null
  phone?:       string | null
  email?:       string | null
}

interface Introduction {
  id:               string
  status:           'PENDING' | 'APPROVED' | 'DECLINED'
  message:          string
  created_at:       string
  cleaner_profiles: CleanerProfile | null
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const STATUS_PILL: Record<Introduction['status'], string> = {
  PENDING:  'bg-[#F0F0F0] text-[#6B8886]',
  APPROVED: 'bg-[#E8F4F3] text-[#19706A]',
  DECLINED: 'bg-red-50 text-red-600',
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('dashboard')
  const locale = useLocale()
  const router = useRouter()

  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role === 'CLEANER') router.replace('/dashboard/cleaner')
  }, [session, sessionStatus, router])

  // Fetch introductions once confirmed CUSTOMER
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CUSTOMER') return
    fetch('/api/introductions')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setIntros(data) })
      .catch(() => setError('Failed to load introductions. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  if (sessionStatus === 'loading' || !session || session.user.role === 'CLEANER') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const statusLabels: Record<Introduction['status'], string> = {
    PENDING:  t('pending'),
    APPROVED: t('approved'),
    DECLINED: t('declined'),
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto">

        {/* Page heading */}
        <h1 className="text-[24px] font-medium text-[#0D1F1E] mb-8">
          {t('welcomeBack', { name: session.user.name })}
        </h1>

        {/* Section heading + count badge */}
        <div className="flex items-center gap-2.5 mb-4">
          <h2 className="text-[17px] font-medium text-[#0D1F1E]">{t('yourIntroductions')}</h2>
          {!loading && intros.length > 0 && (
            <span className="text-[12px] font-medium bg-[#E8F4F3] text-[#19706A] px-2 py-0.5 rounded-full">
              {intros.length}
            </span>
          )}
        </div>

        {/* Inline error */}
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 mb-4">
            {error}
          </p>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-5 h-[88px] animate-pulse" />
            ))}
          </div>

        ) : intros.length === 0 && !error ? (
          /* Empty state */
          <div className="card p-10 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12L14 3l10 9v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                <path d="M10 24V16h8v8" />
              </svg>
            </div>
            <div>
              <p className="text-[16px] font-medium text-[#0D1F1E] mb-1">{t('noIntrosYet')}</p>
              <p className="text-[13px] text-[#6B8886]">{t('noIntrosBody')}</p>
            </div>
            <Link href="/cleaners" className="btn-primary">{t('findACleaner')}</Link>
          </div>

        ) : (
          /* Introduction cards */
          <div className="space-y-3">
            {intros.map(intro => {
              const cp       = intro.cleaner_profiles
              const name     = cp?.display_name ?? '—'
              const initials = getInitials(name)

              return (
                <div key={intro.id} className="card p-5">
                  <div className="flex items-start gap-4">

                    {/* Avatar */}
                    <div className="shrink-0 w-12 h-12 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[15px] font-medium overflow-hidden">
                      {cp?.photo_url
                        ? <img src={cp.photo_url} alt={name} className="w-full h-full object-cover" />
                        : initials
                      }
                    </div>

                    <div className="flex-1 min-w-0">

                      {/* Name + status + date */}
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                        <p className="text-[15px] font-medium text-[#0D1F1E]">{name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${STATUS_PILL[intro.status]}`}>
                            {statusLabels[intro.status]}
                          </span>
                          <span className="text-[12px] text-[#6B8886]">
                            {t('sentOn')} {dateFormatter.format(new Date(intro.created_at))}
                          </span>
                        </div>
                      </div>

                      {/* City pills */}
                      {cp?.cities && cp.cities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {cp.cities.map(city => (
                            <span key={city} className="badge-teal">{city}</span>
                          ))}
                        </div>
                      )}

                      {/* APPROVED: contact details */}
                      {intro.status === 'APPROVED' && (
                        <div className="mt-3 pt-3 border-t border-[#E0EDEC]">
                          <div className="flex items-center gap-1.5 mb-2">
                            {/* Unlocked padlock */}
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#19706A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="1.5" y="5.5" width="10" height="7" rx="1" />
                              <path d="M4 5.5V3.5a2.5 2.5 0 0 1 5 0" />
                            </svg>
                            <p className="text-[12px] font-medium text-[#19706A]">{t('contactDetails')}</p>
                          </div>

                          <div className="space-y-1.5 mb-3">
                            {cp?.phone && (
                              <div className="flex items-center gap-2 text-[13px]">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#6B8886] shrink-0" aria-hidden="true">
                                  <path d="M12.25 9.917a1.167 1.167 0 0 1-1.167 1.166 11.083 11.083 0 0 1-9.916-9.916A1.167 1.167 0 0 1 2.333 2h1.75c.525 0 .98.35 1.108.862l.642 2.566a1.167 1.167 0 0 1-.315 1.13L4.55 7.536a8.167 8.167 0 0 0 1.913 1.913l.978-.968a1.167 1.167 0 0 1 1.13-.315l2.567.642c.512.128.862.583.862 1.108h-.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="text-[#0D1F1E]">{cp.phone}</span>
                              </div>
                            )}
                            {cp?.email && (
                              <div className="flex items-center gap-2 text-[13px]">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#6B8886] shrink-0" aria-hidden="true">
                                  <rect x="1.167" y="2.917" width="11.667" height="8.167" rx="1.167" stroke="currentColor" strokeWidth="1.2" />
                                  <path d="M1.167 4.083 7 7.583l5.833-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                                <span className="text-[#0D1F1E]">{cp.email}</span>
                              </div>
                            )}
                          </div>

                          <button
                            disabled
                            className="btn-secondary rounded-full px-4 py-2 text-[13px] opacity-50 cursor-not-allowed"
                          >
                            {t('chatComingSoon')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Sign out */}
        <div className="mt-10 text-center">
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
