'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/navigation'
import AdminNav from '@/components/admin/AdminNav'

interface DisputeCustomer {
  id: string
  full_name: string
  email: string
}

interface DisputeCleaner {
  id: string
  display_name: string
  user_id: string | null
}

interface DisputeBooking {
  id: string
  date: string
  start_time: string
  duration_hours: number | null
  bedrooms: number | null
  bathrooms: number | null
  cleaning_type: string | null
  address: string | null
  notes: string | null
  photo_urls: string[]
}

interface Dispute {
  id: string
  claim: string
  cleaner_response: string | null
  status: string
  created_at: string
  resolved_at: string | null
  customer: DisputeCustomer | null
  cleaner_profiles: DisputeCleaner | null
  booking: DisputeBooking | null
}

export default function AdminDisputesPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('admin')
  const tBooking = useTranslations('booking')
  const locale   = useLocale()
  const router   = useRouter()

  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [session, sessionStatus, router])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/disputes')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setDisputes(data) })
      .catch(() => setError(t('disputesLoadError')))
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
            <h1 className="text-h2 font-display text-teal-900">{t('disputesTitle')}</h1>
            <p className="text-muted mt-1">{t('disputesSubtitle')}</p>
          </div>
          <button className="btn-ghost shrink-0" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {loading && <p className="text-muted">{t('loading')}</p>}

        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && disputes.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 font-medium">{t('disputesEmpty')}</p>
            <p className="text-muted mt-1">{t('disputesEmptyBody')}</p>
          </div>
        )}

        {!loading && disputes.length > 0 && (
          <ul className="space-y-6">
            {disputes.map(d => {
              const b = d.booking
              return (
                <li key={d.id} className="card p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-teal">{t('customerLabel')}</span>
                        <p className="font-medium text-teal-900">{d.customer?.full_name ?? t('unknownUser')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-gold">{t('cleanerLabel')}</span>
                        <p className="font-medium text-teal-900">{d.cleaner_profiles?.display_name ?? t('unknownUser')}</p>
                      </div>
                    </div>
                    <span className="text-label uppercase tracking-widest text-muted">
                      {t('filedOn', { date: dateFormatter.format(new Date(d.created_at)) })}
                    </span>
                  </div>

                  {b && (
                    <div className="mb-3">
                      <p className="text-label uppercase tracking-widest text-muted mb-1">{t('bookingDetails')}</p>
                      <p className="text-body text-teal-900">
                        {tBooking(b.duration_hours == null ? 'summaryNoDuration' : 'summary', {
                          cleaningType: tBooking(b.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
                          bedrooms: b.bedrooms ?? '—',
                          bathrooms: b.bathrooms ?? '—',
                          date: dateFormatter.format(new Date(`${b.date}T00:00:00`)),
                          time: b.start_time.slice(0, 5),
                          duration: b.duration_hours ?? undefined,
                        })}
                      </p>
                      {b.address && <p className="text-body text-muted mt-0.5">📍 {b.address}</p>}
                    </div>
                  )}

                  <div className="mb-3">
                    <p className="text-label uppercase tracking-widest text-muted mb-1">
                      {t('customerClaim', { name: d.customer?.full_name ?? t('unknownUser') })}
                    </p>
                    <p className="text-body text-teal-900 bg-[#F7FAF9] rounded-lg p-3">{d.claim}</p>
                  </div>

                  <div className="mb-3">
                    <p className="text-label uppercase tracking-widest text-muted mb-1">
                      {t('cleanerResponse', { name: d.cleaner_profiles?.display_name ?? t('unknownUser') })}
                    </p>
                    {d.cleaner_response ? (
                      <p className="text-body text-teal-900 bg-[#F7FAF9] rounded-lg p-3">{d.cleaner_response}</p>
                    ) : (
                      <p className="text-body text-muted italic">
                        {t('noCleanerResponse', { name: d.cleaner_profiles?.display_name ?? t('unknownUser') })}
                      </p>
                    )}
                  </div>

                  {b && b.photo_urls.length > 0 && (
                    <div>
                      <p className="text-label uppercase tracking-widest text-muted mb-2">{t('completionPhotos')}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {b.photo_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt=""
                              className="w-full aspect-square object-cover rounded-lg border border-border"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
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
