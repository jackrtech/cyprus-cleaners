'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/navigation'
import { extractErrorMessage } from '@/lib/utils'
import FullScreenModal from '@/components/ui/FullScreenModal'

interface DisputeBooking {
  id: string
  date: string
  start_time: string
  duration_hours: number | null
  bedrooms: number | null
  bathrooms: number | null
  cleaning_type: string | null
  address: string | null
  photo_urls: string[]
}

interface Dispute {
  id: string
  claim: string
  cleaner_response: string | null
  status: string
  resolution: 'CUSTOMER' | 'CLEANER' | null
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  customer: { full_name: string } | null
  booking: DisputeBooking | null
}

export default function CleanerDisputesPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('disputes')
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  const [disputes,   setDisputes]   = useState<Dispute[]>([])
  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState<string | null>(null)
  const [viewingId,   setViewingId]  = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [submitting,  setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return
    fetch('/api/cleaner/disputes')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setDisputes(data) })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  async function handleSubmitResponse(id: string) {
    if (submitting || !responseText.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/cleaner/disputes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response: responseText.trim() }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      const updated: Dispute = await res.json()
      setDisputes(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
      setResponseText('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setSubmitting(false)
    }
  }

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const viewing = disputes.find(d => d.id === viewingId) ?? null

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <Link href="/dashboard/cleaner" className="text-body text-teal-500 dark:text-teal-300 hover:text-teal-600 dark:hover:text-teal-300 mb-4 inline-block">
          {t('backToDashboard')}
        </Link>
        <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('title')}</h1>
        <p className="text-muted dark:text-[#9BB0AE] mt-1 mb-8">{t('subtitle')}</p>

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}

        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && disputes.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('empty')}</p>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('emptyBody')}</p>
          </div>
        )}

        {!loading && disputes.length > 0 && (
          <ul className="space-y-3">
            {disputes.map(d => {
              const statusBadge = d.status === 'OPEN'
                ? d.cleaner_response
                  ? { label: t('statusAwaitingAdmin'), className: 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300' }
                  : { label: t('statusNeedsResponse'), className: 'bg-red-50 text-red-600' }
                : d.resolution === 'CLEANER'
                ? { label: t('resolvedInYourFavor'), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
                : { label: t('resolvedAgainstYou'), className: 'bg-red-50 text-red-600' }
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => { setViewingId(d.id); setResponseText(''); setSubmitError(null) }}
                    className="card p-5 w-full text-left hover:border-teal-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">
                          {tBooking('with', { name: d.customer?.full_name ?? t('unknownUser') })}
                        </p>
                        <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mt-1">
                          {t('filedOn', { date: dateFormatter.format(new Date(d.created_at)) })}
                        </p>
                      </div>
                      <span className={`badge ${statusBadge.className}`}>{statusBadge.label}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <FullScreenModal isOpen={!!viewing} onClose={() => setViewingId(null)}>
        {viewing && (() => {
          const b = viewing.booking
          const customerName = viewing.customer?.full_name ?? t('unknownUser')
          return (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0EDEC] dark:border-[#253634] shrink-0">
                <p className="flex-1 min-w-0 text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">
                  {tBooking('with', { name: customerName })}
                </p>
                <button
                  type="button"
                  onClick={() => setViewingId(null)}
                  aria-label="Close"
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                {b && (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('bookingDetails')}</p>
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2]">
                      {tBooking(b.duration_hours == null ? 'summaryNoDuration' : 'summary', {
                        cleaningType: tBooking(b.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
                        bedrooms: b.bedrooms ?? '—',
                        bathrooms: b.bathrooms ?? '—',
                        date: dateFormatter.format(new Date(`${b.date}T00:00:00`)),
                        time: b.start_time.slice(0, 5),
                        duration: b.duration_hours ?? undefined,
                      })}
                    </p>
                    {b.address && <p className="text-body text-muted dark:text-[#9BB0AE] mt-0.5">📍 {b.address}</p>}
                  </div>
                )}

                <div>
                  <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                    {t('customerClaim', { name: customerName })}
                  </p>
                  <p className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3">{viewing.claim}</p>
                </div>

                {b && b.photo_urls.length > 0 && (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-2">{t('completionPhotos')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {b.photo_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={url}
                            alt=""
                            className="w-full aspect-square object-cover rounded-lg border border-border dark:border-[#253634]"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('yourResponse')}</p>
                  {viewing.cleaner_response ? (
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3">{viewing.cleaner_response}</p>
                  ) : viewing.status === 'OPEN' ? (
                    <>
                      <textarea
                        value={responseText}
                        onChange={e => setResponseText(e.target.value.slice(0, 2000))}
                        placeholder={t('responsePlaceholder')}
                        rows={4}
                        className="input"
                      />
                      {submitError && <p className="text-red-600 text-sm mt-1">{submitError}</p>}
                    </>
                  ) : (
                    <p className="text-body text-muted dark:text-[#9BB0AE] italic">{t('noResponseGiven')}</p>
                  )}
                </div>

                {viewing.status === 'RESOLVED' && (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('adminDecision')}</p>
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2]">
                      {viewing.resolution === 'CLEANER' ? t('resolvedInYourFavor') : t('resolvedAgainstYou')}
                    </p>
                    {viewing.admin_note && (
                      <p className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3 mt-2">{viewing.admin_note}</p>
                    )}
                  </div>
                )}
              </div>

              {viewing.status === 'OPEN' && !viewing.cleaner_response && (
                <div className="px-4 py-3 border-t border-[#E0EDEC] dark:border-[#253634] shrink-0">
                  <button
                    className="btn-primary w-full"
                    disabled={submitting || !responseText.trim()}
                    onClick={() => handleSubmitResponse(viewing.id)}
                  >
                    {t('submitResponse')}
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </FullScreenModal>
    </div>
  )
}
