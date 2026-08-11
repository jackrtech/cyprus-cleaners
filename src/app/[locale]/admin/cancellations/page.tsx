'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/navigation'
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

interface Cancellation {
  id: string
  date: string
  start_time: string
  cancellation_reason: string
  created_at: string
  customer: CancellationCustomer | null
  cancelled_by_user: CancelledByUser | null
  cleaner_profiles: CancellationCleaner | null
}

export default function AdminCancellationsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const tBooking = useTranslations('booking')
  const locale = useLocale()
  const router = useRouter()

  const [cancellations, setCancellations] = useState<Cancellation[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [session, sessionStatus, router])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/cancellations')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setCancellations(data) })
      .catch(() => setError(t('cancellationsLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  if (sessionStatus === 'loading' || !session || session.user.role !== 'ADMIN') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#F7FAF9] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900">{t('cancellationsTitle')}</h1>
            <p className="text-muted mt-1">{t('cancellationsSubtitle')}</p>
          </div>
          <button className="btn-ghost shrink-0" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {loading && <p className="text-muted">{t('loading')}</p>}

        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && cancellations.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 font-medium">{t('cancellationsEmpty')}</p>
            <p className="text-muted mt-1">{t('cancellationsEmptyBody')}</p>
          </div>
        )}

        {!loading && cancellations.length > 0 && (
          <ul className="space-y-4">
            {cancellations.map(c => (
              <li key={c.id} className="card p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-medium text-teal-900">
                    {tBooking('with', { name: c.customer?.full_name ?? t('unknownUser') })}
                    {' · '}
                    {c.cleaner_profiles?.display_name ?? t('unknownUser')}
                  </p>
                  <span className="badge bg-red-50 text-red-600">
                    {dateFormatter.format(new Date(`${c.date}T00:00:00`))} {c.start_time.slice(0, 5)}
                  </span>
                </div>
                <p className="text-label uppercase tracking-widest text-muted mt-2">
                  {t('cancelledBy', { name: c.cancelled_by_user?.full_name ?? t('unknownUser') })}
                </p>
                <p className="text-body text-teal-900 mt-2 bg-[#F7FAF9] rounded-lg p-3">
                  {c.cancellation_reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
