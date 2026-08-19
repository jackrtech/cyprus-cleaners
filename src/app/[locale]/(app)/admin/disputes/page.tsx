'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { extractErrorMessage } from '@/lib/utils'
import AdminNav from '@/components/admin/AdminNav'
import FullScreenModal from '@/components/ui/FullScreenModal'

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

interface DisputeAssignment {
  cleaner_profile_id: string
  tier_rate_eur: number
  platform_fee_eur: number | null
  cleaner_profiles: { id: string; display_name: string; user_id: string | null } | null
}

interface DisputeAssignmentOutcome {
  cleaner_profile_id: string
  resolution: 'CUSTOMER' | 'CLEANER' | 'UNRESOLVABLE'
  refund_percentage: number
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
  payment: { status: string; amount_eur: number } | null
  booking_assignments: DisputeAssignment[] | null
}

type DisputeResolution = 'CUSTOMER' | 'CLEANER' | 'UNRESOLVABLE'

interface Dispute {
  id: string
  claim: string
  cleaner_response: string | null
  status: string
  resolution: DisputeResolution | null
  refund_percentage: number
  resolve_by: string | null
  auto_resolved: boolean
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  customer: DisputeCustomer | null
  cleaner_profiles: DisputeCleaner | null
  dispute_assignment_outcomes: DisputeAssignmentOutcome[] | null
  booking: DisputeBooking | null
}

export default function AdminDisputesPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('admin')
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  const [disputes,    setDisputes]    = useState<Dispute[]>([])
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState<string | null>(null)
  const [viewingId,    setViewingId]   = useState<string | null>(null)
  const [noteText,     setNoteText]    = useState('')
  const [pendingId,    setPendingId]   = useState<string | null>(null)
  const [actionError,  setActionError] = useState<string | null>(null)
  const [splitPercentage, setSplitPercentage] = useState(50)
  // Multi-cleaner disputes: one resolution + percentage per assigned
  // cleaner, keyed by cleaner_profile_id. Reset whenever a new dispute is
  // opened (see the onClick handlers below).
  const [assignmentDecisions, setAssignmentDecisions] = useState<Record<string, { resolution: DisputeResolution; refundPercentage: number }>>({})


  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/disputes')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setDisputes(data) })
      .catch(() => setError(t('disputesLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  async function handleResolve(id: string, resolution: DisputeResolution) {
    if (pendingId) return
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/disputes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          resolution,
          note: noteText.trim() || undefined,
          refund_percentage: resolution === 'UNRESOLVABLE' ? splitPercentage : undefined,
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      const updated: Dispute = await res.json()
      setDisputes(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
      setViewingId(null)
      setNoteText('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
    }
  }

  async function handleResolveMulti(id: string, assignments: DisputeAssignment[]) {
    if (pendingId) return
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/disputes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          note: noteText.trim() || undefined,
          assignments: assignments.map(a => {
            const decision = assignmentDecisions[a.cleaner_profile_id] ?? { resolution: 'CLEANER' as DisputeResolution, refundPercentage: 0 }
            return {
              cleaner_profile_id: a.cleaner_profile_id,
              resolution: decision.resolution,
              refund_percentage: decision.resolution === 'UNRESOLVABLE' ? decision.refundPercentage : undefined,
            }
          }),
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      const updated: Dispute = await res.json()
      setDisputes(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
      setViewingId(null)
      setNoteText('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
    }
  }

  async function handleRefund(id: string) {
    if (pendingId) return
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/disputes/${id}/refund`, { method: 'POST' })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      const { status }: { status: string } = await res.json()
      setDisputes(prev => prev.map(d =>
        d.id === id && d.booking?.payment
          ? { ...d, booking: { ...d.booking, payment: { ...d.booking.payment, status } } }
          : d
      ))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
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
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('disputesTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('disputesSubtitle')}</p>
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

        {!loading && !error && disputes.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('disputesEmpty')}</p>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('disputesEmptyBody')}</p>
          </div>
        )}

        {!loading && disputes.length > 0 && (
          <ul className="space-y-3">
            {disputes.map(d => {
              const isOverdue = d.status === 'OPEN' && !!d.resolve_by && new Date(d.resolve_by).getTime() < Date.now()
              const statusBadge = d.status === 'OPEN'
                ? (isOverdue
                    ? { label: t('statusOverdue'), className: 'bg-red-100 text-red-700' }
                    : { label: t('statusOpen'), className: 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300' })
                : d.resolution === 'CUSTOMER' && d.auto_resolved
                ? { label: t('resolvedAutoTimeout'), className: 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300' }
                : d.resolution === 'CUSTOMER'
                ? { label: t('resolvedForCustomer'), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
                : d.resolution === 'UNRESOLVABLE'
                ? { label: t('resolvedUnresolvable'), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
                : { label: t('resolvedForCleaner'), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => { setViewingId(d.id); setNoteText(''); setAssignmentDecisions({}) }}
                    className="card p-5 w-full text-left hover:border-teal-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-teal">{t('customerLabel')}</span>
                          <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{d.customer?.full_name ?? t('unknownUser')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-gold">{t('cleanerLabel')}</span>
                          <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">
                            {d.cleaner_profiles?.display_name
                              ?? (d.booking?.booking_assignments?.length
                                    ? t('teamOfCleaners', { count: d.booking.booking_assignments.length })
                                    : t('unknownUser'))}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`badge ${statusBadge.className}`}>{statusBadge.label}</span>
                        <span className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE]">
                          {t('filedOn', { date: dateFormatter.format(new Date(d.created_at)) })}
                        </span>
                        {d.status === 'OPEN' && d.resolve_by && (
                          <span className={`text-label uppercase tracking-widest ${isOverdue ? 'text-red-600' : 'text-muted dark:text-[#9BB0AE]'}`}>
                            {isOverdue
                              ? t('slaOverdue')
                              : t('slaHoursLeft', { hours: Math.max(0, Math.ceil((new Date(d.resolve_by).getTime() - Date.now()) / 3600000)) })}
                          </span>
                        )}
                      </div>
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
          const assignments = b?.booking_assignments ?? null
          const isMulti = !viewing.cleaner_profiles && !!assignments?.length
          const customerName = viewing.customer?.full_name ?? t('unknownUser')
          const cleanerName  = viewing.cleaner_profiles?.display_name
            ?? (isMulti ? t('teamOfCleaners', { count: assignments!.length }) : t('unknownUser'))
          return (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0EDEC] dark:border-[#253634] shrink-0">
                <p className="flex-1 min-w-0 text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">
                  {customerName} · {cleanerName}
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
                <div className="flex items-center gap-2">
                  <span className="badge badge-teal">{t('customerLabel')}</span>
                  <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{customerName}</p>
                </div>
                {isMulti ? (
                  <div className="-mt-2 space-y-1">
                    <span className="badge badge-gold">{t('cleanerLabel')}</span>
                    <ul className="text-body text-teal-900 dark:text-[#ECF3F2] pl-1">
                      {assignments!.map(a => (
                        <li key={a.cleaner_profile_id}>
                          {a.cleaner_profiles?.display_name ?? t('unknownUser')}
                          {' — €'}{(a.tier_rate_eur * (b?.duration_hours ?? 0) + (a.platform_fee_eur ?? 0)).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 -mt-2">
                    <span className="badge badge-gold">{t('cleanerLabel')}</span>
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{cleanerName}</p>
                  </div>
                )}

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

                <div>
                  <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">
                    {t('cleanerResponse', { name: cleanerName })}
                  </p>
                  {viewing.cleaner_response ? (
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3">{viewing.cleaner_response}</p>
                  ) : (
                    <p className="text-body text-muted dark:text-[#9BB0AE] italic">{t('noCleanerResponse', { name: cleanerName })}</p>
                  )}
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

                {viewing.status === 'RESOLVED' ? (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('resolutionLabel')}</p>
                    {isMulti ? (
                      <ul className="text-body text-teal-900 dark:text-[#ECF3F2] space-y-1">
                        {assignments!.map(a => {
                          const outcome = viewing.dispute_assignment_outcomes?.find(o => o.cleaner_profile_id === a.cleaner_profile_id)
                          const name = a.cleaner_profiles?.display_name ?? t('unknownUser')
                          return (
                            <li key={a.cleaner_profile_id}>
                              {!outcome ? name
                                : outcome.resolution === 'CUSTOMER' ? t('resolvedForCustomerNamed', { name: customerName }) + ` (${name})`
                                : outcome.resolution === 'UNRESOLVABLE' ? t('resolvedUnresolvableNamed', { percentage: outcome.refund_percentage }) + ` (${name})`
                                : t('resolvedForCleanerNamed', { name })}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2]">
                      {viewing.resolution === 'CUSTOMER' && viewing.auto_resolved
                        ? t('resolvedAutoTimeoutNamed', { name: customerName })
                        : viewing.resolution === 'CUSTOMER'
                        ? t('resolvedForCustomerNamed', { name: customerName })
                        : viewing.resolution === 'UNRESOLVABLE'
                        ? t('resolvedUnresolvableNamed', { percentage: viewing.refund_percentage })
                        : t('resolvedForCleanerNamed', { name: cleanerName })}
                    </p>
                    )}
                    {viewing.admin_note && (
                      <p className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3 mt-2">{viewing.admin_note}</p>
                    )}
                    {viewing.resolution === 'CUSTOMER' && b?.payment && (b.payment.status === 'PAID' || b.payment.status === 'REFUND_FAILED') && (
                      <button
                        type="button"
                        onClick={() => handleRefund(viewing.id)}
                        disabled={pendingId === viewing.id}
                        className="btn-ghost mt-3 !text-red-600 disabled:opacity-50"
                      >
                        {b.payment.status === 'REFUND_FAILED' ? t('retryRefund') : t('refundCustomer', { amount: b.payment.amount_eur.toFixed(2) })}
                      </button>
                    )}
                    {b?.payment?.status === 'REFUND_FAILED' && (
                      <p className="text-body text-red-600 mt-1">{t('refundFailedNote')}</p>
                    )}
                    {b?.payment?.status === 'REFUNDED' && (
                      <p className="text-body text-teal-600 dark:text-teal-300 mt-2">{t('refunded')}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="dispute-admin-note" className="label">{t('adminNote')}</label>
                    <textarea
                      id="dispute-admin-note"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value.slice(0, 1000))}
                      placeholder={t('adminNotePlaceholder')}
                      rows={3}
                      className="input"
                    />
                    <p className="text-muted dark:text-[#9BB0AE] text-sm mt-1">{t('disputeNoteHint')}</p>
                  </div>
                )}
              </div>

              {viewing.status === 'OPEN' && isMulti && (
                <div className="px-4 py-3 border-t border-[#E0EDEC] dark:border-[#253634] shrink-0 space-y-3">
                  {assignments!.map(a => {
                    const name = a.cleaner_profiles?.display_name ?? t('unknownUser')
                    const decision = assignmentDecisions[a.cleaner_profile_id] ?? { resolution: 'CLEANER' as DisputeResolution, refundPercentage: 0 }
                    function setDecision(patch: Partial<{ resolution: DisputeResolution; refundPercentage: number }>) {
                      setAssignmentDecisions(prev => ({
                        ...prev,
                        [a.cleaner_profile_id]: { ...decision, ...patch },
                      }))
                    }
                    return (
                      <div key={a.cleaner_profile_id} className="space-y-1.5">
                        <p className="text-body font-medium text-teal-900 dark:text-[#ECF3F2]">{name}</p>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <button
                            type="button"
                            className={decision.resolution === 'CLEANER' ? 'btn-primary !py-1.5 text-body' : 'btn-ghost !py-1.5 text-body'}
                            onClick={() => setDecision({ resolution: 'CLEANER' })}
                          >
                            {t('resolveForCleaner', { name })}
                          </button>
                          <button
                            type="button"
                            className={decision.resolution === 'UNRESOLVABLE' ? 'btn-primary !py-1.5 text-body' : 'btn-ghost !py-1.5 text-body'}
                            onClick={() => setDecision({ resolution: 'UNRESOLVABLE' })}
                          >
                            {t('resolveUnresolvable')}
                          </button>
                          <button
                            type="button"
                            className={decision.resolution === 'CUSTOMER' ? 'btn-primary !py-1.5 text-body' : 'btn-ghost !py-1.5 text-body'}
                            onClick={() => setDecision({ resolution: 'CUSTOMER' })}
                          >
                            {t('resolveForCustomer', { name: customerName })}
                          </button>
                          {decision.resolution === 'UNRESOLVABLE' && (
                            <span className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                value={decision.refundPercentage}
                                onChange={e => setDecision({ refundPercentage: Math.min(100, Math.max(0, Number(e.target.value))) })}
                                className="input !py-1.5 !w-16 text-body"
                              />
                              <span className="text-body text-muted dark:text-[#9BB0AE]">%</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <button
                    className="btn-primary w-full"
                    disabled={pendingId === viewing.id}
                    onClick={() => handleResolveMulti(viewing.id, assignments!)}
                  >
                    {t('submitResolution')}
                  </button>
                </div>
              )}

              {viewing.status === 'OPEN' && !isMulti && (
                <div className="px-4 py-3 border-t border-[#E0EDEC] dark:border-[#253634] shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="dispute-split-percentage" className="text-body text-muted dark:text-[#9BB0AE] shrink-0">{t('splitRefundLabel')}</label>
                    <input
                      id="dispute-split-percentage"
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={splitPercentage}
                      onChange={e => setSplitPercentage(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="input !py-1.5 !w-20 text-body"
                    />
                    <span className="text-body text-muted dark:text-[#9BB0AE]">%</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn-ghost flex-1"
                      disabled={pendingId === viewing.id}
                      onClick={() => handleResolve(viewing.id, 'CLEANER')}
                    >
                      {t('resolveForCleaner', { name: cleanerName })}
                    </button>
                    <button
                      className="btn-secondary flex-1"
                      disabled={pendingId === viewing.id}
                      onClick={() => handleResolve(viewing.id, 'UNRESOLVABLE')}
                    >
                      {t('resolveUnresolvable')}
                    </button>
                    <button
                      className="btn-primary flex-1"
                      disabled={pendingId === viewing.id}
                      onClick={() => handleResolve(viewing.id, 'CUSTOMER')}
                    >
                      {t('resolveForCustomer', { name: customerName })}
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </FullScreenModal>
    </div>
  )
}
