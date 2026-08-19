'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import AdminNav from '@/components/admin/AdminNav'

interface Assignment {
  id: string
  cleaner_profile_id: string
  tier_rate_eur: number
  payout_status: string
  no_show: boolean
  cleaner_profiles: { id: string; display_name: string } | null
}

interface TeamBooking {
  id: string
  date: string
  start_time: string
  duration_hours: number | null
  address: string | null
  customer: { id: string; full_name: string } | null
  booking_assignments: Assignment[] | null
}

export default function AdminTeamBookingsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()

  const [bookings, setBookings] = useState<TeamBooking[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/team-bookings')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setBookings(data) })
      .catch(() => setError(t('teamBookingsLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  async function toggleNoShow(assignmentId: string, nextValue: boolean) {
    if (pendingId) return
    setPendingId(assignmentId)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/booking-assignments/${assignmentId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ no_show: nextValue }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || t('actionError'))
      setBookings(prev => prev.map(b => ({
        ...b,
        booking_assignments: (b.booking_assignments ?? []).map(a =>
          a.id === assignmentId ? { ...a, no_show: nextValue } : a
        ),
      })))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
    }
  }

  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('teamBookingsTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('teamBookingsSubtitle')}</p>
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

        {!loading && !error && bookings.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('teamBookingsEmpty')}</p>
          </div>
        )}

        {!loading && bookings.length > 0 && (
          <ul className="space-y-4">
            {bookings.map(b => (
              <li key={b.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-teal">{t('customerLabel')}</span>
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{b.customer?.full_name ?? t('unknownUser')}</p>
                  </div>
                  <span className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE]">
                    {dateFormatter.format(new Date(`${b.date}T00:00:00`))} {b.start_time.slice(0, 5)}
                  </span>
                </div>
                {b.address && <p className="text-body text-muted dark:text-[#9BB0AE] mb-3">📍 {b.address}</p>}
                <ul className="space-y-2">
                  {(b.booking_assignments ?? []).map(a => {
                    const locked = !['PENDING', 'BLOCKED'].includes(a.payout_status)
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 flex-wrap bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3">
                        <span className="text-body text-teal-900 dark:text-[#ECF3F2] break-words">
                          {a.cleaner_profiles?.display_name ?? t('unknownUser')} · €{a.tier_rate_eur.toFixed(2)}/hr
                        </span>
                        <label className="flex items-center gap-2 text-body text-muted dark:text-[#9BB0AE] cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={a.no_show}
                            disabled={locked || pendingId === a.id}
                            onChange={e => toggleNoShow(a.id, e.target.checked)}
                            className="w-4 h-4 accent-red-600"
                          />
                          {t('noShow')}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
