'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import AdminNav from '@/components/admin/AdminNav'

interface FailedPayment {
  id: string
  booking_id: string
  cleaner_payout_eur: number | null
  booking: { id: string; date: string; cleaner_profiles: { id: string; display_name: string } | null } | null
}

interface FailedAssignment {
  id: string
  booking_id: string
  cleaner_payout_eur: number | null
  booking: { id: string; date: string } | null
  cleaner_profiles: { id: string; display_name: string } | null
}

interface FailedPayoutRow {
  id: string
  kind: 'payment' | 'assignment'
  bookingId: string
  date: string | null
  cleanerName: string
  amount: number | null
}

export default function AdminFailedPayoutsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()

  const [rows,    setRows]    = useState<FailedPayoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/payouts/failed')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: { payments: FailedPayment[]; assignments: FailedAssignment[] }) => {
        const paymentRows: FailedPayoutRow[] = data.payments.map(p => ({
          id: p.id,
          kind: 'payment',
          bookingId: p.booking_id,
          date: p.booking?.date ?? null,
          cleanerName: p.booking?.cleaner_profiles?.display_name ?? t('unknownUser'),
          amount: p.cleaner_payout_eur,
        }))
        const assignmentRows: FailedPayoutRow[] = data.assignments.map(a => ({
          id: a.id,
          kind: 'assignment',
          bookingId: a.booking_id,
          date: a.booking?.date ?? null,
          cleanerName: a.cleaner_profiles?.display_name ?? t('unknownUser'),
          amount: a.cleaner_payout_eur,
        }))
        setRows([...paymentRows, ...assignmentRows])
      })
      .catch(() => setError(t('failedPayoutsLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  async function retryPayout(row: FailedPayoutRow) {
    if (retryingId) return
    setRetryingId(row.id)
    setActionError(null)
    try {
      const url = row.kind === 'payment'
        ? `/api/admin/payments/${row.id}/retry-payout`
        : `/api/admin/booking-assignments/${row.id}/retry-payout`
      const res = await fetch(url, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || t('actionError'))
      setRows(prev => prev.filter(r => r.id !== row.id))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setRetryingId(null)
    }
  }

  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('failedPayoutsTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('failedPayoutsSubtitle')}</p>
          </div>
          {/* md:hidden — mobile-only sign-out; see admin/users/page.tsx for why */}
          <button className="btn-ghost shrink-0 md:hidden" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {actionError && (
          <div className="mb-4 rounded-md bg-red-50 text-red-600 px-4 py-3 text-body">{actionError}</div>
        )}

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}
        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('failedPayoutsEmpty')}</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map(row => (
              <li key={`${row.kind}-${row.id}`} className="card p-5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">
                    {row.cleanerName} · €{row.amount != null ? row.amount.toFixed(2) : '—'}
                  </p>
                  <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mt-1">
                    {row.date ? dateFormatter.format(new Date(`${row.date}T00:00:00`)) : ''} · {row.bookingId.slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={retryingId === row.id}
                  onClick={() => retryPayout(row)}
                >
                  {retryingId === row.id ? t('retryingPayout') : t('retryPayout')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
