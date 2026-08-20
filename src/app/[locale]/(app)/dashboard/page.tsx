'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter, usePathname } from '@/navigation'
import ChatPanel from '@/components/chat/ChatPanel'
import ReviewPrompt from '@/components/reviews/ReviewPrompt'
import DashboardTabs from '@/components/dashboard/DashboardTabs'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'
import { groupBookingsByPriority, extractErrorMessage } from '@/lib/utils'
import type { BookingStatus, CleaningType } from '@/types'

interface CleanerProfile {
  id?:              string
  slug?:            string
  display_name:     string
  photo_url:        string | null
  cities:           string[] | null
  phone?:           string | null
  email?:           string | null
  hourly_rate_eur?: number
  cleaner_service_offerings?: { code: string; price_eur: number }[] | null
}

interface LastMessage {
  body:         string | null
  photo_path:   string | null
  system_event: string | null
  created_at:   string
}

const SYSTEM_EVENT_KEY: Record<string, string> = {
  REQUESTED: 'systemRequested',
  CONFIRMED: 'systemConfirmed',
  DECLINED:  'systemDeclined',
  CANCELLED: 'systemCancelled',
  COMPLETED: 'systemCompleted',
}

interface Introduction {
  id:               string
  created_at:       string
  cleaner_profiles: CleanerProfile | null
  last_message:     LastMessage | null
  has_unread:       boolean
  booking_fee_eur:  number
}

interface Booking {
  id:                 string
  introduction_id:    string
  status:             BookingStatus
  bedrooms:           number | null
  bathrooms:          number | null
  cleaning_type:      CleaningType | null
  date:               string
  start_time:         string
  duration_hours:     number | null
  notes:              string | null
  address:            string | null
  address_lat:        number | null
  address_lng:        number | null
  finding_us_notes:   string | null
  created_at:         string
  cleaner_profiles:   CleanerProfile | null
  // Null on both cleaner_profiles and cleaner_profile_id together is the
  // multi-cleaner discriminator (see FLOWS.md §11) -- booking_assignments is
  // where the assigned cleaners actually live for that case.
  booking_assignments: { id: string; cleaner_profile_id: string; cleaner_profiles: { id: string; slug: string; display_name: string; photo_url: string | null } | null; no_show_flags: { id: string; status: string }[] | null }[] | null
  reviews:            { id: string }[] | null
  disputes:           { id: string; status: string }[] | null
  photo_urls:         string[]
  cancellation_reason: string | null
  review_skipped_at:  string | null
  completed_at:       string | null
  payments:           { amount_eur: number; platform_fee_eur: number | null; status: string } | { amount_eur: number; platform_fee_eur: number | null; status: string }[] | null
}

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  REQUESTED: 'badge-gold',
  CONFIRMED: 'badge-teal',
  COMPLETED: 'badge-blue',
  CANCELLED: 'bg-red-50 text-red-600',
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('dashboard')
  const tAuth    = useTranslations('auth')
  const tBooking = useTranslations('booking')
  const tChat    = useTranslations('chat')
  const locale   = useLocale()
  const router   = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [bookings,        setBookings]        = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading]  = useState(true)
  const [bookingActionPendingId, setBookingActionPendingId] = useState<string | null>(null)
  const [bookingActionError,     setBookingActionError]     = useState<string | null>(null)

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resending,     setResending]     = useState(false)
  const [resendResult,  setResendResult]  = useState<'sent' | 'rate_limited' | null>(null)

  const [openChatId, setOpenChatId] = useState<string | null>(null)
  const [skippedReviewIds, setSkippedReviewIds] = useState<Set<string>>(new Set())
  const activeTab = searchParams.get('tab') === 'messages' ? 'messages' : 'bookings'
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReasonText, setCancelReasonText] = useState('')
  const [disputingId, setDisputingId] = useState<string | null>(null)
  const [disputeClaimText, setDisputeClaimText] = useState('')
  const [flaggingAssignmentId, setFlaggingAssignmentId] = useState<string | null>(null)
  const [noShowClaimText, setNoShowClaimText] = useState('')

  // Fetch introductions once confirmed CUSTOMER
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CUSTOMER') return
    fetch('/api/introductions')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setIntros(data) })
      .catch(() => setError('Failed to load introductions. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  // Fetch bookings once confirmed CUSTOMER
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CUSTOMER') return
    fetch('/api/bookings')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setBookings(data) })
      .catch(() => {})
      .finally(() => setBookingsLoading(false))
  }, [session, sessionStatus])

  // Fetch email verification status
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    fetch('/api/user/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEmailVerified(d.email_verified ?? null) })
      .catch(() => {})
  }, [sessionStatus])

  async function handleResendVerification() {
    setResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      if (res.status === 429) setResendResult('rate_limited')
      else if (res.ok) setResendResult('sent')
    } catch {
      // ignore
    } finally {
      setResending(false)
    }
  }

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const threads       = intros.filter(i => i.last_message !== null)
  const bookingGroups = groupBookingsByPriority(bookings)

  // Cancel used to only be reachable from chat — now it's on the card itself,
  // reaching parity with the cleaner dashboard's own booking actions.
  async function handleCancelBooking(bookingId: string, reason: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'CANCEL', reason }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const updated: Booking = await res.json()
      setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
      setCancellingId(null)
      setCancelReasonText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  async function handleFileDispute(bookingId: string, claim: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch('/api/disputes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking_id: bookingId, claim }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const dispute: { id: string; status: string } = await res.json()
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, disputes: [...(b.disputes ?? []), dispute] } : b
      ))
      setDisputingId(null)
      setDisputeClaimText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  async function handleFileNoShow(bookingId: string, assignmentId: string, claim: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch('/api/no-show-flags', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assignment_id: assignmentId, claim }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const flag: { id: string; status: string } = await res.json()
      setBookings(prev => prev.map(b => b.id === bookingId ? {
        ...b,
        booking_assignments: (b.booking_assignments ?? []).map(a =>
          a.id === assignmentId ? { ...a, no_show_flags: [...(a.no_show_flags ?? []), flag] } : a
        ),
      } : b))
      setFlaggingAssignmentId(null)
      setNoShowClaimText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  function renderBookingCard(booking: Booking) {
    const cp = booking.cleaner_profiles
    // Multi-cleaner bookings have no single cleaner_profiles row (see the
    // Booking interface's note) -- join the assigned cleaners' names instead
    // of falling back to a blank "-", which is what used to render here.
    const assignedNames = (booking.booking_assignments ?? [])
      .map(a => a.cleaner_profiles?.display_name)
      .filter((n): n is string => !!n)
    const cleanerDisplayName = cp?.display_name ?? (assignedNames.length > 0 ? assignedNames.join(' & ') : '—')
    const bookingSummary = tBooking(booking.duration_hours == null ? 'summaryNoDuration' : 'summary', {
      cleaningType: tBooking(booking.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
      bedrooms: booking.bedrooms ?? '—',
      bathrooms: booking.bathrooms ?? '—',
      date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${booking.date}T00:00:00`)),
      time: booking.start_time.slice(0, 5),
      duration: booking.duration_hours ?? undefined,
    })
    const needsReview = booking.status === 'COMPLETED'
      && (!booking.reviews || booking.reviews.length === 0)
      && !booking.review_skipped_at
      && !skippedReviewIds.has(booking.id)

    return (
      <div key={booking.id} className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setViewingBookingId(booking.id)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingBookingId(booking.id) }
          }}
          aria-label={tBooking('with', { name: cleanerDisplayName })}
          className="card p-5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {cp?.slug ? (
                  <Link
                    href={`/cleaners/${cp.slug}`}
                    onClick={e => e.stopPropagation()}
                    className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] hover:text-[#19706A] hover:underline"
                  >
                    {tBooking('with', { name: cp.display_name })}
                  </Link>
                ) : (
                  <p className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">
                    {tBooking('with', { name: cleanerDisplayName })}
                  </p>
                )}
                <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${BOOKING_STATUS_BADGE[booking.status]}`}>
                  {tBooking(
                    booking.status === 'REQUESTED' ? 'statusRequested'
                    : booking.status === 'CONFIRMED' ? 'statusConfirmed'
                    : booking.status === 'COMPLETED' ? 'statusCompleted'
                    : 'statusCancelled'
                  )}
                </span>
              </div>
              <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{bookingSummary}</p>
              {booking.address && (
                <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] line-clamp-1 mt-0.5">📍 {booking.address}</p>
              )}
              {(booking.status === 'REQUESTED' || booking.status === 'CONFIRMED') && (
                cancellingId === booking.id ? (
                  <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                    <textarea
                      value={cancelReasonText}
                      onChange={e => setCancelReasonText(e.target.value)}
                      placeholder={tBooking('cancelReasonPlaceholder')}
                      rows={2}
                      maxLength={500}
                      className="input text-[13px]"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleCancelBooking(booking.id, cancelReasonText)}
                        disabled={bookingActionPendingId === booking.id}
                        className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        {tBooking('confirmCancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCancellingId(null); setCancelReasonText('') }}
                        className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors"
                      >
                        {tBooking('neverMind')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setCancellingId(booking.id) }}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      {tBooking('cancelBooking')}
                    </button>
                  </div>
                )
              )}
              {booking.status === 'COMPLETED' && (() => {
                const hoursLeft = booking.completed_at
                  ? 24 - Math.floor((Date.now() - new Date(booking.completed_at).getTime()) / 3600000)
                  : null
                const windowExpired = hoursLeft !== null && hoursLeft <= 0
                return (booking.disputes?.length ?? 0) > 0 ? (
                  <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] mt-2">{tBooking('disputeSubmitted')}</p>
                ) : windowExpired ? (
                  <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] mt-2">{tBooking('disputeWindowPassed')}</p>
                ) : disputingId === booking.id ? (
                  <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                    <textarea
                      value={disputeClaimText}
                      onChange={e => setDisputeClaimText(e.target.value)}
                      placeholder={tBooking('disputeClaimPlaceholder')}
                      rows={2}
                      maxLength={2000}
                      className="input text-[13px]"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleFileDispute(booking.id, disputeClaimText)}
                        disabled={bookingActionPendingId === booking.id || !disputeClaimText.trim()}
                        className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        {tBooking('submitDispute')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDisputingId(null); setDisputeClaimText('') }}
                        className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors"
                      >
                        {tBooking('neverMind')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setDisputingId(booking.id) }}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      {tBooking('fileDispute')}
                    </button>
                    {hoursLeft !== null && (
                      <span className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE]">
                        {tBooking('disputeHoursLeft', { hours: hoursLeft })}
                      </span>
                    )}
                  </div>
                )
              })()}
              {booking.status === 'COMPLETED' && (booking.booking_assignments?.length ?? 0) > 0 && (() => {
                const hoursLeft = booking.completed_at
                  ? 24 - Math.floor((Date.now() - new Date(booking.completed_at).getTime()) / 3600000)
                  : null
                const windowExpired = hoursLeft !== null && hoursLeft <= 0
                return (
                  <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                    {booking.booking_assignments!.map(a => {
                      const name = a.cleaner_profiles?.display_name ?? tBooking('unknownCleaner')
                      const flag = (a.no_show_flags ?? [])[0] ?? null
                      if (flag) {
                        return (
                          <p key={a.id} className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
                            {tBooking('noShowFlagged', { name })}
                          </p>
                        )
                      }
                      if (windowExpired) return null
                      if (flaggingAssignmentId === a.id) {
                        return (
                          <div key={a.id} className="space-y-2">
                            <textarea
                              value={noShowClaimText}
                              onChange={e => setNoShowClaimText(e.target.value)}
                              placeholder={tBooking('noShowClaimPlaceholder', { name })}
                              rows={2}
                              maxLength={2000}
                              className="input text-[13px]"
                            />
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleFileNoShow(booking.id, a.id, noShowClaimText)}
                                disabled={bookingActionPendingId === booking.id || !noShowClaimText.trim()}
                                className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                              >
                                {tBooking('submitNoShow')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setFlaggingAssignmentId(null); setNoShowClaimText('') }}
                                className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors"
                              >
                                {tBooking('neverMind')}
                              </button>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={e => { e.stopPropagation(); setFlaggingAssignmentId(a.id); setNoShowClaimText('') }}
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          {tBooking('reportNoShow', { name })}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {needsReview && (
          <ReviewPrompt
            bookingId={booking.id}
            cleanerName={cp?.display_name ?? '—'}
            subtitle={bookingSummary}
            onSubmitted={review => {
              setBookings(prev => prev.map(b =>
                b.id === booking.id ? { ...b, reviews: [{ id: review.id }] } : b
              ))
            }}
            onSkip={() => setSkippedReviewIds(prev => new Set(prev).add(booking.id))}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto">

        {/* Email verification banner */}
        {emailVerified === false && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] dark:bg-[#332B0F] border-l-4 border-[#F2C94C] rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tAuth('verifyEmailBanner')}</p>
            {resendResult === 'sent' ? (
              <span className="text-[13px] text-[#19706A] shrink-0">{tAuth('emailSent')}</span>
            ) : resendResult === 'rate_limited' ? (
              <span className="text-[13px] text-red-600 shrink-0">{tAuth('pleaseWait')}</span>
            ) : (
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full disabled:opacity-50"
              >
                {tAuth('resendEmail')}
              </button>
            )}
          </div>
        )}

        {/* Page heading */}
        <h1 className="text-[24px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-8">
          {t('welcomeBack', { name: session.user.name })}
        </h1>

        {/* Inline error */}
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 mb-4">
            {error}
          </p>
        )}

        {/* Loading skeleton (covers the tabs below) */}
        {loading ? (
          <div className="space-y-3 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-5 h-[88px] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Tabs: Bookings / Messages — mobile switches via the bottom tab
                bar instead, so this pill only shows at desktop widths */}
            <div className="hidden md:block">
              <DashboardTabs
                idPrefix="customer-dashboard"
                ariaLabel={t('sectionsLabel')}
                activeKey={activeTab}
                onChange={key => router.push(`${pathname}?tab=${key}`)}
                tabs={[
                  { key: 'bookings', label: tBooking('yourBookings'), count: bookingGroups.requested.length },
                  { key: 'messages', label: t('messagesTab'), count: threads.filter(i => i.has_unread).length },
                ]}
              />
            </div>

            {/* Bookings panel */}
            <div
              role="tabpanel"
              id="customer-dashboard-panel-bookings"
              aria-labelledby="customer-dashboard-tab-bookings"
              hidden={activeTab !== 'bookings'}
            >
              {bookingsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div key={i} className="card p-5 h-[80px] animate-pulse" />
                  ))}
                </div>
              ) : bookings.length === 0 ? (
                <div className="card p-8 flex flex-col items-center text-center gap-2">
                  <p className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{tBooking('noBookingsYet')}</p>
                  <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('noBookingsBodyCustomer')}</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {bookingActionError && (
                    <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                      {bookingActionError}
                    </p>
                  )}
                  {bookingGroups.requested.length > 0 && (
                    <div>
                      <h2 className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] uppercase tracking-wide mb-3">
                        {tBooking('awaitingConfirmation')}
                      </h2>
                      <div className="space-y-3">{bookingGroups.requested.map(renderBookingCard)}</div>
                    </div>
                  )}
                  {bookingGroups.confirmed.length > 0 && (
                    <div>
                      <h2 className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] uppercase tracking-wide mb-3">
                        {tBooking('upcoming')}
                      </h2>
                      <div className="space-y-3">{bookingGroups.confirmed.map(renderBookingCard)}</div>
                    </div>
                  )}
                  {bookingGroups.history.length > 0 && (
                    <div>
                      <h2 className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] uppercase tracking-wide mb-3">
                        {tBooking('bookingHistory')}
                      </h2>
                      <div className="space-y-3">{bookingGroups.history.map(renderBookingCard)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Messages panel */}
            <div
              role="tabpanel"
              id="customer-dashboard-panel-messages"
              aria-labelledby="customer-dashboard-tab-messages"
              hidden={activeTab !== 'messages'}
            >
              {threads.length === 0 && !error ? (
                <div className="card p-10 flex flex-col items-center text-center gap-5">
                  <div className="w-16 h-16 rounded-full bg-[#E8F4F3] dark:bg-[#17302D] flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 12L14 3l10 9v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                      <path d="M10 24V16h8v8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[16px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1">{t('noIntrosYet')}</p>
                    <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{t('noIntrosBody')}</p>
                  </div>
                  <Link href="/cleaners" className="btn-primary">{t('findACleaner')}</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {threads.map(intro => {
                    const cp        = intro.cleaner_profiles
                    const name      = cp?.display_name ?? '—'
                    const initials  = getInitials(name)
                    const isChatOpen = openChatId === intro.id
                    const previewText = intro.last_message?.system_event
                      ? tBooking(SYSTEM_EVENT_KEY[intro.last_message.system_event] ?? 'systemUnknown')
                      : intro.last_message?.body ?? tChat('photoMessage')

                    return (
                      <div key={intro.id} className="card overflow-hidden">
                        <div className="p-5">
                          {/* Header row — avatar+name+date on the left, the chat
                              toggle inline on the right, matching the cleaner
                              dashboard's compact IntroCard layout instead of
                              stacking the button in its own full-width row */}
                          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0 w-10 h-10 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[13px] font-medium overflow-hidden">
                                {cp?.photo_url
                                  ? <img src={cp.photo_url} alt={name} className="w-full h-full object-cover" />
                                  : initials
                                }
                              </div>
                              <div className="min-w-0">
                                <p className="text-[15px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">{name}</p>
                                <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
                                  {t('sentOn')} {dateFormatter.format(new Date(intro.created_at))}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setOpenChatId(isChatOpen ? null : intro.id)}
                              className={`rounded-full px-4 py-2 text-[13px] shrink-0 ${
                                isChatOpen ? 'btn-secondary' : 'btn-ghost'
                              }`}
                            >
                              {isChatOpen ? 'Close chat' : 'Open chat'}
                            </button>
                          </div>

                          {/* City pills — matches the softer, normal-case city
                              tag style used on CleanerCard rather than the loud
                              uppercase badge-teal treatment (meant for status
                              badges like booking state, not plain metadata) */}
                          {cp?.cities && cp.cities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {cp.cities.map(city => (
                                <span key={city} className="inline-block bg-[#E6F1FF] dark:bg-[#122A42] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                                  {city}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Most recent message preview — hidden once the chat is open below */}
                          {!isChatOpen && (
                            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] line-clamp-2 mt-2">{previewText}</p>
                          )}
                        </div>

                        {isChatOpen && (
                          // Full-screen takeover on mobile so the chat can't be
                          // accidentally scrolled past — inline expansion (desktop
                          // behavior, kept via md:) made it easy to scroll the chat
                          // out of view entirely on small screens.
                          <div className="max-md:fixed max-md:inset-0 max-md:z-[300] max-md:bg-white dark:max-md:bg-[#16211F] max-md:flex max-md:flex-col">
                            <ChatPanel
                              embedded
                              introductionId={intro.id}
                              currentUserId={session.user.id}
                              currentUserRole="CUSTOMER"
                              otherPartyName={cp?.display_name ?? 'Cleaner'}
                              otherPartyAvatar={cp?.photo_url ?? null}
                              hourlyRateEur={cp?.hourly_rate_eur ?? null}
                              bookingFeeEur={intro.booking_fee_eur}
                              offerings={cp?.cleaner_service_offerings ?? null}
                              onClose={() => setOpenChatId(null)}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      <BookingDetailModal
        isOpen={!!viewingBookingId}
        onClose={() => setViewingBookingId(null)}
        booking={(() => {
          const b = bookings.find(b => b.id === viewingBookingId)
          if (!b) return null
          const assignedNames = (b.booking_assignments ?? [])
            .map(a => a.cleaner_profiles?.display_name)
            .filter((n): n is string => !!n)
          return {
            otherPartyName:     b.cleaner_profiles?.display_name ?? (assignedNames.length > 0 ? assignedNames.join(' & ') : '—'),
            otherPartyPhotoUrl: b.cleaner_profiles?.photo_url ?? null,
            otherPartySlug:     b.cleaner_profiles?.slug ?? null,
            cleanerCount:       b.cleaner_profiles ? 1 : (b.booking_assignments?.length ?? 1),
            status:             b.status,
            date:               b.date,
            start_time:         b.start_time,
            duration_hours:     b.duration_hours,
            bedrooms:           b.bedrooms,
            bathrooms:          b.bathrooms,
            cleaning_type:      b.cleaning_type,
            notes:              b.notes,
            address:            b.address,
            addressLat:         b.address_lat,
            addressLng:         b.address_lng,
            findingUsNotes:     b.finding_us_notes,
            photo_urls:         b.photo_urls,
            cancellationReason: b.cancellation_reason,
            payment: (() => {
              const p = Array.isArray(b.payments) ? b.payments[0] ?? null : b.payments
              return p ? { amountEur: p.amount_eur, platformFeeEur: p.platform_fee_eur } : null
            })(),
          }
        })()}
        onBookAgain={() => {
          const b = bookings.find(b => b.id === viewingBookingId)
          if (!b) return
          router.push(`${pathname}?tab=messages`)
          setOpenChatId(b.introduction_id)
          setViewingBookingId(null)
        }}
      />
    </div>
  )
}
