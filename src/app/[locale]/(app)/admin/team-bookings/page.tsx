'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { extractErrorMessage } from '@/lib/utils'
import AdminNav from '@/components/admin/AdminNav'
import FullScreenModal from '@/components/ui/FullScreenModal'

interface FlagCustomer {
  id: string
  full_name: string
  email: string
}

interface FlagAssignment {
  id: string
  cleaner_profile_id: string
  tier_rate_eur: number
  platform_fee_eur: number | null
  cleaner_profiles: { id: string; display_name: string; user_id: string | null } | null
}

interface Corroboration {
  cleaner_profile_id: string
  response: 'CORROBORATES' | 'DISPUTES'
  note: string | null
  cleaner_profiles: { display_name: string } | null
}

interface FlagBooking {
  id: string
  date: string
  start_time: string
  duration_hours: number | null
  address: string | null
  photo_urls: string[]
  booking_assignments: { cleaner_profile_id: string; cleaner_profiles: { id: string; display_name: string } | null }[] | null
}

type NoShowResolution = 'REFUND_CUSTOMER' | 'REDIRECT_TO_CLEANER' | 'SPLIT'

interface NoShowFlag {
  id: string
  claim: string
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  cleaner_response: string | null
  contested_at: string | null
  resolve_by: string
  resolution: NoShowResolution | null
  redirect_cleaner_profile_id: string | null
  split_percentage: number | null
  refund_amount_eur: number | null
  redirect_amount_eur: number | null
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  flagged_by_user: FlagCustomer | null
  no_show_corroborations: Corroboration[] | null
  assignment: FlagAssignment | null
  booking: FlagBooking | null
}

export default function AdminTeamBookingsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()

  const [flags,        setFlags]        = useState<NoShowFlag[]>([])
  const [loading,       setLoading]      = useState(true)
  const [error,         setError]        = useState<string | null>(null)
  const [viewingId,     setViewingId]    = useState<string | null>(null)
  const [noteText,      setNoteText]     = useState('')
  const [pendingId,     setPendingId]    = useState<string | null>(null)
  const [actionError,   setActionError]  = useState<string | null>(null)
  const [resolution,    setResolution]   = useState<NoShowResolution>('REFUND_CUSTOMER')
  const [redirectTo,    setRedirectTo]   = useState('')
  const [splitPercentage, setSplitPercentage] = useState(50)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/no-show-flags')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setFlags(data) })
      .catch(() => setError(t('teamBookingsLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  function resetResolveForm() {
    setResolution('REFUND_CUSTOMER')
    setRedirectTo('')
    setSplitPercentage(50)
    setNoteText('')
  }

  async function handleReject(id: string) {
    if (pendingId) return
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/no-show-flags/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'REJECTED', note: noteText.trim() || undefined }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      const updated: NoShowFlag = await res.json()
      setFlags(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f))
      setViewingId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
    }
  }

  async function handleConfirm(id: string) {
    if (pendingId) return
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/no-show-flags/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status: 'CONFIRMED',
          resolution,
          redirect_cleaner_profile_id: resolution !== 'REFUND_CUSTOMER' ? (redirectTo || undefined) : undefined,
          split_percentage: resolution === 'SPLIT' ? splitPercentage : undefined,
          note: noteText.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      const updated: NoShowFlag = await res.json()
      setFlags(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f))
      setViewingId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
    }
  }

  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const viewing = flags.find(f => f.id === viewingId) ?? null

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

        {!loading && !error && flags.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('teamBookingsEmpty')}</p>
          </div>
        )}

        {!loading && flags.length > 0 && (
          <ul className="space-y-3">
            {flags.map(f => {
              const isOverdue = f.status === 'PENDING' && new Date(f.resolve_by).getTime() < Date.now()
              const statusBadge = f.status === 'PENDING'
                ? (isOverdue
                    ? { label: t('statusOverdue'), className: 'bg-red-100 text-red-700' }
                    : { label: t('statusOpen'), className: 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300' })
                : f.status === 'CONFIRMED'
                ? { label: t('noShowConfirmed'), className: 'bg-red-100 text-red-700' }
                : { label: t('noShowRejected'), className: 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' }
              const cleanerName = f.assignment?.cleaner_profiles?.display_name ?? t('unknownUser')
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => { setViewingId(f.id); resetResolveForm() }}
                    className="card p-5 w-full text-left hover:border-teal-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-teal">{t('customerLabel')}</span>
                          <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{f.flagged_by_user?.full_name ?? t('unknownUser')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-gold">{t('flaggedCleanerLabel')}</span>
                          <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{cleanerName}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`badge ${statusBadge.className}`}>{statusBadge.label}</span>
                        <span className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE]">
                          {t('filedOn', { date: dateFormatter.format(new Date(f.created_at)) })}
                        </span>
                        {f.status === 'PENDING' && (
                          <span className={`text-label uppercase tracking-widest ${isOverdue ? 'text-red-600' : 'text-muted dark:text-[#9BB0AE]'}`}>
                            {isOverdue
                              ? t('slaOverdue')
                              : t('slaHoursLeft', { hours: Math.max(0, Math.ceil((new Date(f.resolve_by).getTime() - Date.now()) / 3600000)) })}
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
          const cleanerName = viewing.assignment?.cleaner_profiles?.display_name ?? t('unknownUser')
          const customerName = viewing.flagged_by_user?.full_name ?? t('unknownUser')
          const shareEur = viewing.assignment
            ? viewing.assignment.tier_rate_eur * (b?.duration_hours ?? 0) + (viewing.assignment.platform_fee_eur ?? 0)
            : 0
          const otherAssignments = (b?.booking_assignments ?? []).filter(a => a.cleaner_profile_id !== viewing.assignment?.cleaner_profile_id)

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
                <div className="flex items-center gap-2 -mt-2">
                  <span className="badge badge-gold">{t('flaggedCleanerLabel')}</span>
                  <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{cleanerName} — €{shareEur.toFixed(2)}</p>
                </div>

                {b && (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('bookingDetails')}</p>
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2]">
                      {dateFormatter.format(new Date(`${b.date}T00:00:00`))} {b.start_time.slice(0, 5)}
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

                {otherAssignments.length > 0 && (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('corroborationsLabel')}</p>
                    <ul className="space-y-1.5">
                      {otherAssignments.map(a => {
                        const c = (viewing.no_show_corroborations ?? []).find(x => x.cleaner_profile_id === a.cleaner_profile_id)
                        const name = a.cleaner_profiles?.display_name ?? t('unknownUser')
                        return (
                          <li key={a.cleaner_profile_id} className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3">
                            <span className="font-medium">{name}</span>{' — '}
                            {!c ? t('corroborationPending') : c.response === 'CORROBORATES' ? t('corroborationAgrees') : t('corroborationDisagrees')}
                            {c?.note && <span className="block text-muted dark:text-[#9BB0AE] mt-1">{c.note}</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

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

                {viewing.status !== 'PENDING' ? (
                  <div>
                    <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mb-1">{t('resolutionLabel')}</p>
                    <p className="text-body text-teal-900 dark:text-[#ECF3F2]">
                      {viewing.status === 'REJECTED'
                        ? t('noShowRejectedBody', { name: cleanerName })
                        : viewing.resolution === 'REFUND_CUSTOMER'
                        ? t('noShowRefundedBody', { amount: (viewing.refund_amount_eur ?? 0).toFixed(2) })
                        : viewing.resolution === 'REDIRECT_TO_CLEANER'
                        ? t('noShowRedirectedBody', { amount: (viewing.redirect_amount_eur ?? 0).toFixed(2) })
                        : t('noShowSplitBody', { refund: (viewing.refund_amount_eur ?? 0).toFixed(2), redirect: (viewing.redirect_amount_eur ?? 0).toFixed(2) })}
                    </p>
                    {viewing.admin_note && (
                      <p className="text-body text-teal-900 dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3 mt-2">{viewing.admin_note}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="noshow-admin-note" className="label">{t('adminNote')}</label>
                    <textarea
                      id="noshow-admin-note"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value.slice(0, 1000))}
                      placeholder={t('adminNotePlaceholder')}
                      rows={3}
                      className="input"
                    />
                  </div>
                )}
              </div>

              {viewing.status === 'PENDING' && (
                <div className="px-4 py-3 border-t border-[#E0EDEC] dark:border-[#253634] shrink-0 space-y-3">
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <button
                      type="button"
                      className={resolution === 'REFUND_CUSTOMER' ? 'btn-primary !py-1.5 text-body' : 'btn-ghost !py-1.5 text-body'}
                      onClick={() => setResolution('REFUND_CUSTOMER')}
                    >
                      {t('noShowResolveRefund')}
                    </button>
                    <button
                      type="button"
                      className={resolution === 'REDIRECT_TO_CLEANER' ? 'btn-primary !py-1.5 text-body' : 'btn-ghost !py-1.5 text-body'}
                      onClick={() => setResolution('REDIRECT_TO_CLEANER')}
                      disabled={otherAssignments.length === 0}
                    >
                      {t('noShowResolveRedirect')}
                    </button>
                    <button
                      type="button"
                      className={resolution === 'SPLIT' ? 'btn-primary !py-1.5 text-body' : 'btn-ghost !py-1.5 text-body'}
                      onClick={() => setResolution('SPLIT')}
                    >
                      {t('noShowResolveSplit')}
                    </button>
                  </div>

                  {(resolution === 'REDIRECT_TO_CLEANER' || resolution === 'SPLIT') && otherAssignments.length > 0 && (
                    <select
                      value={redirectTo}
                      onChange={e => setRedirectTo(e.target.value)}
                      className="input !py-1.5 text-body"
                    >
                      <option value="">{t('noShowRedirectPickCleaner')}</option>
                      {otherAssignments.map(a => (
                        <option key={a.cleaner_profile_id} value={a.cleaner_profile_id}>
                          {a.cleaner_profiles?.display_name ?? t('unknownUser')}
                        </option>
                      ))}
                    </select>
                  )}

                  {resolution === 'SPLIT' && (
                    <div className="flex items-center gap-2">
                      <label htmlFor="noshow-split-percentage" className="text-body text-muted dark:text-[#9BB0AE] shrink-0">{t('splitRefundLabel')}</label>
                      <input
                        id="noshow-split-percentage"
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
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn-ghost flex-1"
                      disabled={pendingId === viewing.id}
                      onClick={() => handleReject(viewing.id)}
                    >
                      {t('noShowReject')}
                    </button>
                    <button
                      className="btn-primary flex-1"
                      disabled={
                        pendingId === viewing.id ||
                        (resolution === 'REDIRECT_TO_CLEANER' && !redirectTo)
                      }
                      onClick={() => handleConfirm(viewing.id)}
                    >
                      {t('noShowConfirm')}
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
