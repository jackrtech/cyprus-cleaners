'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { createClient } from '@/lib/supabase/client'

interface CleanerProfile {
  slug:      string
  bio:       string | null
  photo_url: string | null
  cities:    string[] | null
}

interface IntroUser {
  full_name: string
}

interface Introduction {
  id:         string
  status:     'PENDING' | 'APPROVED' | 'DECLINED'
  message:    string
  created_at: string
  users:      IntroUser | null
}

const STATUS_PILL: Record<Introduction['status'], string> = {
  PENDING:  'bg-[#F0F0F0] text-[#6B8886]',
  APPROVED: 'bg-[#E8F4F3] text-[#19706A]',
  DECLINED: 'bg-red-50 text-red-600',
}

interface IntroCardProps {
  intro:         Introduction
  statusLabel:   string
  tApprove:      string
  tDecline:      string
  tReceivedOn:   string
  dateFormatter: Intl.DateTimeFormat
  onAction:      (id: string, action: 'APPROVE' | 'DECLINE') => Promise<void>
}

function IntroCard({ intro, statusLabel, tApprove, tDecline, tReceivedOn, dateFormatter, onAction }: IntroCardProps) {
  const [acting,    setActing]    = useState<'APPROVE' | 'DECLINE' | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)

  const customerName = intro.users?.full_name ?? '—'

  async function handleAction(action: 'APPROVE' | 'DECLINE') {
    setActing(action)
    setCardError(null)
    try {
      await onAction(intro.id, action)
    } catch {
      setCardError('Something went wrong. Please try again.')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <p className="text-[15px] font-medium text-[#0D1F1E]">{customerName}</p>
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${STATUS_PILL[intro.status]}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-[12px] text-[#6B8886]">
            {tReceivedOn} {dateFormatter.format(new Date(intro.created_at))}
          </p>
        </div>

        {intro.status === 'PENDING' && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleAction('DECLINE')}
              disabled={!!acting}
              className="btn-ghost rounded-full px-4 py-2 text-[13px] disabled:opacity-50"
            >
              {acting === 'DECLINE' ? '…' : tDecline}
            </button>
            <button
              onClick={() => handleAction('APPROVE')}
              disabled={!!acting}
              className="btn-primary rounded-full px-4 py-2 text-[13px] disabled:opacity-50"
            >
              {acting === 'APPROVE' ? '…' : tApprove}
            </button>
          </div>
        )}
      </div>

      <p className="text-[13px] text-[#6B8886] leading-relaxed">{intro.message}</p>

      {cardError && (
        <p className="text-[12px] text-red-600 mt-2">{cardError}</p>
      )}
    </div>
  )
}

export default function CleanerDashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('dashboard')
  const locale = useLocale()
  const router = useRouter()

  const [profile, setProfile] = useState<CleanerProfile | null>(null)
  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role === 'CUSTOMER') router.replace('/dashboard')
  }, [session, sessionStatus, router])

  // Parallel fetch: intros from API + profile from Supabase
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return

    const supabase = createClient()

    Promise.all([
      fetch('/api/introductions')
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
      supabase
        .from('cleaner_profiles')
        .select('slug, bio, photo_url, cities')
        .eq('user_id', session.user.id)
        .single()
        .then(({ data }) => data),
    ])
      .then(([introData, profileData]) => {
        if (Array.isArray(introData)) setIntros(introData)
        if (profileData) setProfile(profileData as CleanerProfile)
      })
      .catch(() => setError('Failed to load dashboard data. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  const handleAction = useCallback(async (id: string, action: 'APPROVE' | 'DECLINE') => {
    const res = await fetch(`/api/introductions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action }),
    })
    if (!res.ok) throw new Error()
    const updated = await res.json()
    setIntros(prev => prev.map(i => i.id === id ? { ...i, status: updated.status } : i))
  }, [])

  if (sessionStatus === 'loading' || !session || session.user.role === 'CUSTOMER') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const profileIncomplete =
    !profile?.bio || !profile?.photo_url || !profile?.cities || profile.cities.length === 0

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
      <div className="max-w-[720px] mx-auto space-y-8">

        {/* SECTION 1 — Profile completion banner */}
        {!loading && profileIncomplete && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] border-l-4 border-[#F2C94C] rounded-lg px-5 py-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] flex-1">{t('completeProfileBanner')}</p>
            <Link href="/dashboard/cleaner/edit" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {t('editProfile')}
            </Link>
          </div>
        )}

        {/* Inline error */}
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
            {error}
          </p>
        )}

        {/* SECTION 2 — Introduction requests */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <h2 className="text-[17px] font-medium text-[#0D1F1E]">{t('introRequests')}</h2>
            {!loading && intros.length > 0 && (
              <span className="text-[12px] font-medium bg-[#E8F4F3] text-[#19706A] px-2 py-0.5 rounded-full">
                {intros.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="card p-5 h-[100px] animate-pulse" />
              ))}
            </div>
          ) : intros.length === 0 && !error ? (
            <div className="card p-10 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M24 3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4l3 4 3-4h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" />
                </svg>
              </div>
              <div>
                <p className="text-[16px] font-medium text-[#0D1F1E] mb-1">{t('noIntroRequestsYet')}</p>
                <p className="text-[13px] text-[#6B8886]">{t('noIntroRequestsBody')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {intros.map(intro => (
                <IntroCard
                  key={intro.id}
                  intro={intro}
                  statusLabel={statusLabels[intro.status]}
                  tApprove={t('approve')}
                  tDecline={t('decline')}
                  tReceivedOn={t('receivedOn')}
                  dateFormatter={dateFormatter}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3 — Quick links */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/dashboard/cleaner/edit"
              className="card p-5 flex items-center gap-3 hover:shadow-md transition-shadow"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11.5 2a1.5 1.5 0 0 1 2.12 2.12L4.5 13.24l-3 .75.75-3L11.5 2z" />
              </svg>
              <span className="text-[14px] text-[#0D1F1E]">{t('editProfile')}</span>
            </Link>

            {profile?.slug ? (
              <Link
                href={`/cleaners/${profile.slug}`}
                className="card p-5 flex items-center gap-3 hover:shadow-md transition-shadow"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6.5 2.5H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5M9.5 1H15v5.5M15 1l-7 7" />
                </svg>
                <span className="text-[14px] text-[#0D1F1E]">{t('viewPublicProfile')}</span>
              </Link>
            ) : (
              <div className="card p-5 flex items-center gap-3 opacity-40 cursor-not-allowed select-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6.5 2.5H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5M9.5 1H15v5.5M15 1l-7 7" />
                </svg>
                <span className="text-[14px] text-[#0D1F1E]">{t('viewPublicProfile')}</span>
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-[13px] text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
            >
              {t('signOut')}
            </button>
          </div>
        </section>

      </div>
    </div>
  )
}
