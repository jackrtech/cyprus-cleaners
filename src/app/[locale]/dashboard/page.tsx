'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import ChatPanel from '@/components/chat/ChatPanel'

interface CleanerProfile {
  id?:           string
  display_name:  string
  photo_url:     string | null
  cities:        string[] | null
  phone?:        string | null
  email?:        string | null
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

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('dashboard')
  const tAuth  = useTranslations('auth')
  const locale = useLocale()
  const router = useRouter()

  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resending,     setResending]     = useState(false)
  const [resendResult,  setResendResult]  = useState<'sent' | 'rate_limited' | null>(null)

  const [openChatId, setOpenChatId] = useState<string | null>(null)

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

  // Fetch email verification status
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    fetch('/api/user/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEmailVerified(d.email_verified ?? null) })
      .catch(() => {})
  }, [sessionStatus])

  async function handleResendVerification() {
    setResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      if (res.status === 429) setResendResult('rate_limited')
      else if (res.ok) setResendResult('sent')
    } catch {
      // ignore
    } finally {
      setResending(false)
    }
  }

  if (sessionStatus === 'loading' || !session || session.user.role === 'CLEANER') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto">

        {/* Email verification banner */}
        {emailVerified === false && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] border-l-4 border-[#F2C94C] rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] flex-1">{tAuth('verifyEmailBanner')}</p>
            {resendResult === 'sent' ? (
              <span className="text-[13px] text-[#19706A] shrink-0">{tAuth('emailSent')}</span>
            ) : resendResult === 'rate_limited' ? (
              <span className="text-[13px] text-red-600 shrink-0">{tAuth('pleaseWait')}</span>
            ) : (
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full disabled:opacity-50"
              >
                {tAuth('resendEmail')}
              </button>
            )}
          </div>
        )}

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
                <div key={intro.id}>
                  <div className="card p-5">
                  <div className="flex items-start gap-4">

                    {/* Avatar */}
                    <div className="shrink-0 w-12 h-12 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[15px] font-medium overflow-hidden">
                      {cp?.photo_url
                        ? <img src={cp.photo_url} alt={name} className="w-full h-full object-cover" />
                        : initials
                      }
                    </div>

                    <div className="flex-1 min-w-0">

                      {/* Name + date */}
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                        <p className="text-[15px] font-medium text-[#0D1F1E]">{name}</p>
                        <span className="text-[12px] text-[#6B8886] shrink-0">
                          {t('sentOn')} {dateFormatter.format(new Date(intro.created_at))}
                        </span>
                      </div>

                      {/* City pills */}
                      {cp?.cities && cp.cities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {cp.cities.map(city => (
                            <span key={city} className="badge-teal">{city}</span>
                          ))}
                        </div>
                      )}

                      {/* Open chat (all statuses) */}
                      <div className="mt-3 pt-3 border-t border-[#E0EDEC]">
                        <button
                          type="button"
                          onClick={() => setOpenChatId(openChatId === intro.id ? null : intro.id)}
                          className={`rounded-full px-4 py-2 text-[13px] ${
                            openChatId === intro.id ? 'btn-secondary' : 'btn-ghost'
                          }`}
                        >
                          {openChatId === intro.id ? 'Close chat' : 'Open chat'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {openChatId === intro.id && (
                  <div className="mt-2 transition-all duration-200">
                    <ChatPanel
                      introductionId={intro.id}
                      currentUserId={session.user.id}
                      otherPartyName={cp?.display_name ?? 'Cleaner'}
                      otherPartyAvatar={cp?.photo_url ?? null}
                      onClose={() => setOpenChatId(null)}
                    />
                  </div>
                )}
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
