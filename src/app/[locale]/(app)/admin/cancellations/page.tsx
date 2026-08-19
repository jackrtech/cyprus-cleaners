'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import AdminNav from '@/components/admin/AdminNav'

interface CancellationCustomer {
  id: string
  full_name: string
  email: string
}

interface CancelledByUser {
  id: string
  full_name: string
  role: string
}

interface CancellationCleaner {
  id: string
  display_name: string
  user_id: string | null
}

interface CancellationPayment {
  status: string
  amount_eur: number
  refunded_at: string | null
}

interface Cancellation {
  id: string
  date: string
  start_time: string
  cancellation_reason: string
  created_at: string
  customer: CancellationCustomer | null
  cancelled_by_user: CancelledByUser | null
  cleaner_profiles: CancellationCleaner | null
  payments: CancellationPayment | CancellationPayment[] | null
}

function paymentOf(c: Cancellation): CancellationPayment | null {
  if (!c.payments) return null
  return Array.isArray(c.payments) ? c.payments[0] ?? null : c.payments
}

export default function AdminCancellationsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()

  const [cancellations, setCancellations] = useState<Cancellation[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)

  async function retryRefund(bookingId: string) {
    setRetrying(bookingId)
    setRetryError(null)
    try {
      const res = await fetch(`/api/admin/cancellations/${bookingId}/retry-refund`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Retry failed')
      setCancellations(prev => prev.map(c => {
        if (c.id !== bookingId) return c
        const payment = paymentOf(c)
        if (!payment) return c
        return { ...c, payments: { ...payment, status: 'REFUNDED', refunded_at: new Date().toISOString() } }
      }))
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetrying(null)
    }
  }


  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/cancellations')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setCancellations(data) })
      .catch(() => setError(t('cancellationsLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('cancellationsTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('cancellationsSubtitle')}</p>
          </div>
          {/* md:hidden — mobile-only sign-out; see admin/users/page.tsx for why */}
          <button className="btn-ghost shrink-0 md:hidden" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}

        {!loading && error && <p className="text-red-600">{error}</p>}

        {retryError && <p className="text-red-600 text-body mb-4">{retryError}</p>}

        {!loading && !error && cancellations.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('cancellationsEmpty')}</p>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('cancellationsEmptyBody')}</p>
          </div>
        )}

        {!loading && cancellations.length > 0 && (
          <ul className="space-y-4">
            {cancellations.map(c => {
              const payment = paymentOf(c)
              const isRefundFailed = payment?.status === 'REFUND_FAILED'
              const refundBadge = !payment || payment.status === 'PENDING'
                ? { label: t('notCharged'), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
                : payment.status === 'REFUNDED'
                ? { label: t('refundedBadge', { amount: payment.amount_eur.toFixed(2) }), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
                : payment.status === 'REFUND_FAILED'
                ? { label: t('refundFailed'), className: 'bg-red-100 text-red-700' }
                : payment.status === 'PAID'
                ? { label: t('chargedNotRefunded'), className: 'bg-red-50 text-red-600' }
                : { label: t('chargeFailed'), className: 'bg-red-50 text-red-600' }
              return (
                <li
                  key={c.id}
                  className={`card p-5 ${isRefundFailed ? 'border-red-300 bg-red-50/40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-teal">{t('customerLabel')}</span>
                        <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{c.customer?.full_name ?? t('unknownUser')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-gold">{t('cleanerLabel')}</span>
                        <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{c.cleaner_profiles?.display_name ?? t('unknownUser')}</p>
                      </div>
                    </div>
                    <span className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] shrink-0">
                      {dateFormatter.format(new Date(`${c.date}T00:00:00`))} {c.start_time.slice(0, 5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <span className={`badge ${refundBadge.className}`}>{refundBadge.label}</span>
                    <span className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE]">
                      {t('cancelledBy', { name: c.cancelled_by_user?.full_name ?? t('unknownUser') })}
                    </span>
                  </div>
                  <p className="text-body text-teal-900 dark:text-[#ECF3F2] mt-2 bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3">
                    {c.cancellation_reason}
                  </p>
                  {isRefundFailed && (
                    <button
                      className="btn-secondary mt-3"
                      disabled={retrying === c.id}
                      onClick={() => retryRefund(c.id)}
                    >
                      {retrying === c.id ? t('retryingRefund') : t('retryRefund')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
