'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import AdminNav from '@/components/admin/AdminNav'

interface WeekBucket {
  weekStart:  string
  bookings:   number
  revenueEur: number
}

interface Analytics {
  totals: {
    totalBookings:     number
    completedBookings: number
    cancelledBookings: number
    totalCustomers:    number
    activeCleaners:    number
    revenueEur:        number
  }
  repeatCustomerRatePct: number
  disputeRatePct:        number
  autoResolveRatePct:    number | null
  weekly:                WeekBucket[]
}

// A plain CSS bar chart — no charting library. Data volume here is small
// (12 weekly buckets) and the shape simple enough that a dependency wasn't
// worth it; see the values on hover via the title attribute.
function BarChart({ data, valueOf, formatValue, barClassName }: {
  data: WeekBucket[]
  valueOf: (w: WeekBucket) => number
  formatValue: (n: number) => string
  barClassName: string
}) {
  const max = Math.max(1, ...data.map(valueOf))
  const locale = useLocale()
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })

  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map(w => {
        const value  = valueOf(w)
        const heightPct = Math.max(2, Math.round((value / max) * 100))
        return (
          <div key={w.weekStart} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div
              title={`${dateFmt.format(new Date(`${w.weekStart}T00:00:00`))}: ${formatValue(value)}`}
              className={`w-full rounded-t-sm transition-colors ${barClassName}`}
              style={{ height: `${heightPct}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()

  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/analytics')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: Analytics) => setAnalytics(data))
      .catch(() => setError(t('analyticsLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const firstWeek = analytics?.weekly[0]
  const lastWeek  = analytics?.weekly[analytics.weekly.length - 1]

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('analyticsTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('analyticsSubtitle')}</p>
          </div>
          {/* md:hidden — mobile-only sign-out; see admin/users/page.tsx for why */}
          <button className="btn-ghost shrink-0 md:hidden" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}
        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && analytics && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('totalBookingsLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.totalBookings}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('completedBookingsLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.completedBookings}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('cancelledBookingsLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.cancelledBookings}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('totalCustomersLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.totalCustomers}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('activeCleanersLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.activeCleaners}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('revenueLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">€{analytics.totals.revenueEur.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('repeatCustomerRateLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.repeatCustomerRatePct}%</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('disputeRateLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.disputeRatePct}%</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('autoResolveRateLabel')}</p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">
                  {analytics.autoResolveRatePct === null ? '—' : `${analytics.autoResolveRatePct}%`}
                </p>
                {analytics.autoResolveRatePct === null && (
                  <p className="text-label text-muted dark:text-[#9BB0AE] mt-1">{t('autoResolveRateEmpty')}</p>
                )}
              </div>
            </div>

            {firstWeek && lastWeek && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="card p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body">{t('weeklyBookingsTitle')}</p>
                    <p className="text-label text-muted dark:text-[#9BB0AE]">{t('last12Weeks')}</p>
                  </div>
                  <BarChart
                    data={analytics.weekly}
                    valueOf={w => w.bookings}
                    formatValue={n => String(n)}
                    barClassName="bg-teal-400"
                  />
                  <div className="flex justify-between text-label text-muted dark:text-[#9BB0AE] mt-2">
                    <span>{dateFmt.format(new Date(`${firstWeek.weekStart}T00:00:00`))}</span>
                    <span>{dateFmt.format(new Date(`${lastWeek.weekStart}T00:00:00`))}</span>
                  </div>
                </div>
                <div className="card p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body">{t('weeklyRevenueTitle')}</p>
                    <p className="text-label text-muted dark:text-[#9BB0AE]">{t('last12Weeks')}</p>
                  </div>
                  <BarChart
                    data={analytics.weekly}
                    valueOf={w => w.revenueEur}
                    formatValue={n => `€${n.toFixed(2)}`}
                    barClassName="bg-gold-400"
                  />
                  <div className="flex justify-between text-label text-muted dark:text-[#9BB0AE] mt-2">
                    <span>{dateFmt.format(new Date(`${firstWeek.weekStart}T00:00:00`))}</span>
                    <span>{dateFmt.format(new Date(`${lastWeek.weekStart}T00:00:00`))}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
