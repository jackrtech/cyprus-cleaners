'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Link } from '@/navigation'
import { extractErrorMessage } from '@/lib/utils'
import DashboardTabs from '@/components/dashboard/DashboardTabs'

interface Job {
  booking_id:        string
  date:              string
  start_time:        string
  payout_status:     'PENDING' | 'BLOCKED' | 'PAID' | 'FAILED'
  payout_eur:        number
  payout_is_final:   boolean
  payout_release_at: string | null
}

interface Earnings {
  connect: {
    account_id:        string | null
    details_submitted: boolean
    payouts_enabled:   boolean
  }
  summary: {
    held_eur:     number
    blocked_eur:  number
    paid_eur:     number
    failed_count: number
  }
  jobs: Job[]
}

const STATUS_BADGE: Record<Job['payout_status'], string> = {
  PENDING: 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300',
  BLOCKED: 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300',
  PAID:    'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300',
  FAILED:  'bg-red-50 text-red-600',
}

export default function CleanerEarningsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('earnings')
  const tDash    = useTranslations('dashboard')
  const tBooking = useTranslations('booking')
  const locale   = useLocale()
  const searchParams = useSearchParams()

  const [earnings,      setEarnings]      = useState<Earnings | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [settingUp,     setSettingUp]     = useState(false)
  const [setupError,    setSetupError]    = useState<string | null>(null)

  function loadEarnings() {
    return fetch('/api/cleaner-profiles/me/earnings')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: Earnings) => setEarnings(data))
      .catch(() => setError(t('loadError')))
  }

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return
    loadEarnings().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionStatus])

  // Returning from Stripe's hosted onboarding — account.updated may not have
  // landed yet by the time the browser redirects back, so re-check once
  // shortly after rather than leaving a stale "set up payouts" banner up.
  useEffect(() => {
    if (searchParams.get('onboarded') !== '1') return
    const timeout = setTimeout(() => { loadEarnings() }, 2500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function handleSetupPayouts() {
    if (settingUp) return
    setSettingUp(true)
    setSetupError(null)
    try {
      const res = await fetch('/api/cleaner-profiles/connect/onboard', { method: 'POST' })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('setupError')))
      const { url } = await res.json() as { url: string }
      window.location.href = url
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : t('setupError'))
      setSettingUp(false)
    }
  }

  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <Link href="/dashboard/cleaner" className="text-body text-teal-500 dark:text-teal-300 hover:text-teal-600 dark:hover:text-teal-300 mb-4 inline-block md:hidden">
          {t('backToDashboard')}
        </Link>

        {/* Same tab strip as the main cleaner dashboard — Bookings/Messages
            link back there, Earnings is the (non-navigating) active tab */}
        <div className="hidden md:block mb-6">
          <DashboardTabs
            idPrefix="cleaner-dashboard"
            ariaLabel={tDash('sectionsLabel')}
            activeKey="earnings"
            onChange={() => {}}
            tabs={[
              { key: 'bookings', label: tBooking('bookingRequests'), href: '/dashboard/cleaner?tab=bookings' },
              { key: 'messages', label: tDash('messagesTab'), href: '/dashboard/cleaner?tab=messages' },
              { key: 'earnings', label: tDash('earningsTab') },
            ]}
          />
        </div>

        <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2] mb-1">{t('title')}</h1>
        <p className="text-muted dark:text-[#9BB0AE] mb-8">{t('subtitle')}</p>

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}
        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && earnings && (
          <>
            {!earnings.connect.payouts_enabled && (
              <div className="card p-5 mb-6">
                <p className="text-teal-900 dark:text-[#ECF3F2] font-medium mb-1">
                  {earnings.connect.details_submitted ? t('reviewInProgressTitle') : t('setupNeededTitle')}
                </p>
                <p className="text-body text-muted dark:text-[#9BB0AE] mb-4">
                  {earnings.connect.details_submitted ? t('reviewInProgressBody') : t('setupNeededBody')}
                </p>
                {setupError && <p className="text-body text-red-600 mb-3">{setupError}</p>}
                {!earnings.connect.details_submitted && (
                  <button
                    type="button"
                    onClick={handleSetupPayouts}
                    disabled={settingUp}
                    className="btn-primary !px-4 !py-2 text-body rounded-full disabled:opacity-50"
                  >
                    {settingUp ? t('settingUp') : t('setupPayouts')}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('heldLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">€{earnings.summary.held_eur.toFixed(2)}</p>
              </div>
              {(earnings.summary.blocked_eur > 0 || !earnings.connect.payouts_enabled) && (
                <div className="card p-4">
                  <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('blockedLabel')}</p>
                  <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">€{earnings.summary.blocked_eur.toFixed(2)}</p>
                </div>
              )}
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('paidLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">€{earnings.summary.paid_eur.toFixed(2)}</p>
              </div>
            </div>

            {earnings.summary.failed_count > 0 && (
              <div className="mb-6 rounded-md bg-red-50 text-red-600 px-4 py-3 text-body">
                {t('failedNotice', { count: earnings.summary.failed_count })}
              </div>
            )}

            {earnings.jobs.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('empty')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {earnings.jobs.map(job => (
                  <li key={job.booking_id} className="card p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{dateFormatter.format(new Date(job.date))} · {job.start_time}</p>
                        <p className="text-body text-muted dark:text-[#9BB0AE] mt-1">
                          {job.payout_status === 'PENDING'
                            ? (job.payout_release_at ? t('heldUntil', { date: dateFormatter.format(new Date(job.payout_release_at)) }) : t('heldGeneric'))
                            : job.payout_status === 'BLOCKED'
                            ? t('blockedDetail')
                            : job.payout_status === 'FAILED'
                            ? t('failedDetail')
                            : job.payout_eur === 0
                            ? t('paidZeroDetail')
                            : t('paidDetail')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`badge ${STATUS_BADGE[job.payout_status]}`}>{t(`status${job.payout_status}`)}</span>
                        <span className="text-teal-900 dark:text-[#ECF3F2] font-medium">
                          {job.payout_is_final ? '' : '~'}€{job.payout_eur.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
