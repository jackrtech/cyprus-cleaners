'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import AdminNav from '@/components/admin/AdminNav'
import InfoTooltip from '@/components/ui/InfoTooltip'

interface WeekBucket {
  weekStart:  string
  bookings:   number
  revenueEur: number
}

interface Analytics {
  funnel: {
    requested:              number
    accepted:                number
    completed:               number
    acceptedOfRequestedPct: number
    completedOfAcceptedPct: number
  }
  totals: {
    cancelledBookings: number
    totalCustomers:    number
    activeCleaners:    number
    revenueEur:        number
  }
  disputeRatePct:        number
  autoResolveRatePct:    number | null
  weekly:                WeekBucket[]
  customerSegments: {
    byFrequency:      { noneCompleted: number; oneTime: number; occasional: number; regular: number }
    byDisputeHistory: { none: number; filedNoneWon: number; wonAtLeastOne: number }
  }
  cleanerSegments: {
    byRating:        { noReviewsYet: number; under3: number; threeToUnder4: number; fourToUnder4_5: number; fourPoint5Plus: number }
    byCompletedJobs: { zero: number; oneTo24: number; twentyFiveTo49: number; fiftyTo99: number; hundredTo249: number; twoFiftyPlus: number }
    byDisputeRate:   { none: number; low: number; high: number; noCompletedJobs: number }
  }
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

// A cohort breakdown — label, count, and a proportion-of-total bar. Used for
// every segmentation cut below; deliberately not the same component as
// BarChart above, which is built around a fixed 12-week x-axis rather than
// an arbitrary list of named buckets.
function SegmentBreakdown({ rows }: { rows: { label: string; count: number }[] }) {
  const total = Math.max(1, rows.reduce((sum, r) => sum + r.count, 0))
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] w-[136px] shrink-0 truncate" title={row.label}>{row.label}</span>
          <div className="flex-1 h-2 rounded-full bg-[#F0F5F4] dark:bg-[#142220] overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-400"
              style={{ width: `${Math.round((row.count / total) * 100)}%` }}
            />
          </div>
          <span className="text-[12px] font-medium text-teal-900 dark:text-[#ECF3F2] w-6 text-right shrink-0">{row.count}</span>
        </div>
      ))}
    </div>
  )
}

type RangeKey = '4w' | '12w' | '6m' | 'all'
const RANGE_KEYS: RangeKey[] = ['4w', '12w', '6m', 'all']

export default function AdminAnalyticsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()

  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  // Shared by both weekly charts (Bookings per week / Platform revenue per
  // week), added 2026-08-21 (Todoist) — was hardcoded to 12 weeks with no
  // control. Refetches the whole payload on change rather than adding a
  // second endpoint shape; everything else in the response is range-
  // independent, so this is simplicity over a few wasted lifetime-stat
  // re-queries on a still-small pre-launch dataset.
  const [range, setRange] = useState<RangeKey>('12w')
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    // Only the very first load shows the full-page loading state — a range
    // change re-fetches in the background so the range control (and the
    // rest of the page) never disappears out from under the admin mid-click.
    if (!hasLoadedOnce.current) setLoading(true)
    fetch(`/api/admin/analytics?range=${range}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: Analytics) => setAnalytics(data))
      .catch(() => setError(t('analyticsLoadError')))
      .finally(() => { setLoading(false); hasLoadedOnce.current = true })
  }, [session, sessionStatus, t, range])

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
            <h2 className="text-body font-medium text-teal-900 dark:text-[#ECF3F2] mb-3">{t('funnelTitle')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('requestedLabel')}
                  <InfoTooltip label={t('requestedInfo')}>{t('requestedDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.funnel.requested}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('acceptedLabel')}
                  <InfoTooltip label={t('acceptedInfo')}>{t('acceptedDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.funnel.accepted}</p>
                <p className="text-label text-muted dark:text-[#9BB0AE] mt-1">{t('pctOfRequested', { pct: analytics.funnel.acceptedOfRequestedPct })}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('completedBookingsLabel')}
                  <InfoTooltip label={t('completedBookingsInfo')}>{t('completedBookingsDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.funnel.completed}</p>
                <p className="text-label text-muted dark:text-[#9BB0AE] mt-1">{t('pctOfAccepted', { pct: analytics.funnel.completedOfAcceptedPct })}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('cancelledBookingsLabel')}
                  <InfoTooltip label={t('cancelledBookingsInfo')}>{t('cancelledBookingsDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.cancelledBookings}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('totalCustomersLabel')}
                  <InfoTooltip label={t('totalCustomersInfo')}>{t('totalCustomersDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.totalCustomers}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('activeCleanersLabel')}
                  <InfoTooltip label={t('activeCleanersInfo')}>{t('activeCleanersDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.totals.activeCleaners}</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('revenueLabel')}
                  <InfoTooltip label={t('revenueInfo')}>{t('revenueDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">€{analytics.totals.revenueEur.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('disputeRateLabel')}
                  <InfoTooltip label={t('disputeRateInfo')}>{t('disputeRateDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">{analytics.disputeRatePct}%</p>
              </div>
              <div className="card p-4">
                <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                  {t('autoResolveRateLabel')}
                  <InfoTooltip label={t('autoResolveRateInfo')}>{t('autoResolveRateDef')}</InfoTooltip>
                </p>
                <p className="text-h3 font-display text-teal-900 dark:text-[#ECF3F2]">
                  {analytics.autoResolveRatePct === null ? '—' : `${analytics.autoResolveRatePct}%`}
                </p>
                {analytics.autoResolveRatePct === null && (
                  <p className="text-label text-muted dark:text-[#9BB0AE] mt-1">{t('autoResolveRateEmpty')}</p>
                )}
              </div>
            </div>

            {firstWeek && lastWeek && (
              <>
                <div className="flex items-center justify-end mb-3">
                  <div role="group" aria-label={t('weeklyChartsRangeLabel')} className="inline-flex gap-0.5 bg-[#F0F5F4] dark:bg-[#142220] rounded-full p-0.5">
                    {RANGE_KEYS.map(key => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRange(key)}
                        aria-pressed={range === key}
                        className={`text-[12px] font-medium px-3 py-1 rounded-full transition-colors ${
                          range === key
                            ? 'bg-white dark:bg-[#16211F] text-teal-900 dark:text-[#ECF3F2] shadow-sm'
                            : 'text-muted dark:text-[#9BB0AE] hover:text-teal-900 dark:hover:text-[#ECF3F2]'
                        }`}
                      >
                        {t(`range_${key}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="card p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body">
                      {t('weeklyBookingsTitle')}
                      <InfoTooltip label={t('weeklyChartsInfo')}>{t('weeklyChartsDef')}</InfoTooltip>
                    </p>
                    <p className="text-label text-muted dark:text-[#9BB0AE]">{t(`range_${range}`)}</p>
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
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body">
                      {t('weeklyRevenueTitle')}
                      <InfoTooltip label={t('weeklyChartsInfo')}>{t('weeklyChartsDef')}</InfoTooltip>
                    </p>
                    <p className="text-label text-muted dark:text-[#9BB0AE]">{t(`range_${range}`)}</p>
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
              </>
            )}

            <h2 className="text-body font-medium text-teal-900 dark:text-[#ECF3F2] mt-8 mb-3">{t('customerSegmentsTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <div className="card p-4">
                <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body mb-3">
                  {t('byFrequencyTitle')}
                  <InfoTooltip label={t('byFrequencyInfo')}>{t('byFrequencyDef')}</InfoTooltip>
                </p>
                <SegmentBreakdown rows={[
                  { label: t('freqNoneCompleted'), count: analytics.customerSegments.byFrequency.noneCompleted },
                  { label: t('freqOneTime'),       count: analytics.customerSegments.byFrequency.oneTime },
                  { label: t('freqOccasional'),    count: analytics.customerSegments.byFrequency.occasional },
                  { label: t('freqRegular'),       count: analytics.customerSegments.byFrequency.regular },
                ]} />
              </div>
              <div className="card p-4">
                <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body mb-3">
                  {t('byDisputeHistoryTitle')}
                  <InfoTooltip label={t('byDisputeHistoryInfo')}>{t('byDisputeHistoryDef')}</InfoTooltip>
                </p>
                <SegmentBreakdown rows={[
                  { label: t('disputeHistNone'),         count: analytics.customerSegments.byDisputeHistory.none },
                  { label: t('disputeHistFiledNoneWon'), count: analytics.customerSegments.byDisputeHistory.filedNoneWon },
                  { label: t('disputeHistWon'),          count: analytics.customerSegments.byDisputeHistory.wonAtLeastOne },
                ]} />
              </div>
            </div>

            <h2 className="text-body font-medium text-teal-900 dark:text-[#ECF3F2] mb-3">{t('cleanerSegmentsTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card p-4">
                <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body mb-3">
                  {t('byRatingTitle')}
                  <InfoTooltip label={t('byRatingInfo')}>{t('byRatingDef')}</InfoTooltip>
                </p>
                <SegmentBreakdown rows={[
                  { label: t('ratingNoReviews'), count: analytics.cleanerSegments.byRating.noReviewsYet },
                  { label: t('ratingUnder3'),    count: analytics.cleanerSegments.byRating.under3 },
                  { label: t('rating3to4'),      count: analytics.cleanerSegments.byRating.threeToUnder4 },
                  { label: t('rating4to4_5'),    count: analytics.cleanerSegments.byRating.fourToUnder4_5 },
                  { label: t('rating4_5plus'),   count: analytics.cleanerSegments.byRating.fourPoint5Plus },
                ]} />
              </div>
              <div className="card p-4">
                <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body mb-3">
                  {t('byCompletedJobsTitle')}
                  <InfoTooltip label={t('byCompletedJobsInfo')}>{t('byCompletedJobsDef')}</InfoTooltip>
                </p>
                <SegmentBreakdown rows={[
                  { label: t('jobsZero'),      count: analytics.cleanerSegments.byCompletedJobs.zero },
                  { label: t('jobs1to24'),     count: analytics.cleanerSegments.byCompletedJobs.oneTo24 },
                  { label: t('jobs25to49'),    count: analytics.cleanerSegments.byCompletedJobs.twentyFiveTo49 },
                  { label: t('jobs50to99'),    count: analytics.cleanerSegments.byCompletedJobs.fiftyTo99 },
                  { label: t('jobs100to249'),  count: analytics.cleanerSegments.byCompletedJobs.hundredTo249 },
                  { label: t('jobs250plus'),   count: analytics.cleanerSegments.byCompletedJobs.twoFiftyPlus },
                ]} />
              </div>
              <div className="card p-4">
                <p className="font-medium text-teal-900 dark:text-[#ECF3F2] text-body mb-3">
                  {t('byDisputeRateTitle')}
                  <InfoTooltip label={t('byDisputeRateInfo')}>{t('byDisputeRateDef')}</InfoTooltip>
                </p>
                <SegmentBreakdown rows={[
                  { label: t('disputeRateNone'),   count: analytics.cleanerSegments.byDisputeRate.none },
                  { label: t('disputeRateLow'),    count: analytics.cleanerSegments.byDisputeRate.low },
                  { label: t('disputeRateHigh'),   count: analytics.cleanerSegments.byDisputeRate.high },
                  { label: t('disputeRateNoJobs'), count: analytics.cleanerSegments.byDisputeRate.noCompletedJobs },
                ]} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
