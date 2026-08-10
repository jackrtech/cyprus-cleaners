'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import ChatPanel from '@/components/chat/ChatPanel'
import ReviewPrompt from '@/components/reviews/ReviewPrompt'
import DashboardTabs from '@/components/dashboard/DashboardTabs'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'
import { groupBookingsByPriority, extractErrorMessage } from '@/lib/utils'
import type { BookingStatus, CleaningType } from '@/types'

interface CleanerProfile {
  id?:           string
  display_name:  string
  photo_url:     string | null
  cities:        string[] | null
  phone?:        string | null
  email?:        string | null
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
  created_at:         string
  cleaner_profiles:   CleanerProfile | null
  reviews:            { id: string }[] | null
  photo_urls:         string[]
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
  const [activeTab, setActiveTab] = useState<'bookings' | 'messages'>(
    searchParams.get('tab') === 'messages' ? 'messages' : 'bookings'
  )
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role === 'CLEANER') router.replace('/dashboard/cleaner')
  }, [session, sessionStatus, router])

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

  if (sessionStatus === 'loading' || !session || session.user.role === 'CLEANER') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const threads       = intros.filter(i => i.last_message !== null)
  const bookingGroups = groupBookingsByPriority(bookings)

  // Cancel used to only be reachable from chat — now it's on the card itself,
  // reaching parity with the cleaner dashboard's own booking actions.
  async function handleCancelBooking(bookingId: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'CANCEL' }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const updated: Booking = await res.json()
      setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  function renderBookingCard(booking: Booking) {
    const cp = booking.cleaner_profiles
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
      && !skippedReviewIds.has(booking.id)

    return (
      <div key={booking.id} className="space-y-2">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[14px] font-medium text-[#0D1F1E]">
                  {tBooking('with', { name: cp?.display_name ?? '—' })}
                </p>
                <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${BOOKING_STATUS_BADGE[booking.status]}`}>
                  {tBooking(
                    booking.status === 'REQUESTED' ? 'statusRequested'
                    : booking.status === 'CONFIRMED' ? 'statusConfirmed'
                    : booking.status === 'COMPLETED' ? 'statusCompleted'
                    : 'statusCancelled'
                  )}
                </span>
              </div>
              <p className="text-[13px] text-[#6B8886]">{bookingSummary}</p>
              {booking.address && (
                <p className="text-[12px] text-[#6B8886] line-clamp-1 mt-0.5">📍 {booking.address}</p>
              )}
              {/* Photos aren't fetched into the DOM until this is clicked —
                  see BookingDetailModal. Every booking gets this, not just
                  completed ones with photos, so the full detail view is
                  reachable consistently from any booking of any status. */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setViewingBookingId(booking.id)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#19706A] hover:underline"
                >
                  {tBooking('viewDetails')}
                </button>
                {(booking.status === 'COMPLETED' || booking.status === 'CANCELLED') && (
                  // Rebooking itself already works (canRequestNew in ChatPanel
                  // flips true once the latest booking resolves) — what was
                  // missing was a way back to that chat from here.
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('messages')
                      setOpenChatId(booking.introduction_id)
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#19706A] hover:underline"
                  >
                    {tBooking('bookAgain')}
                  </button>
                )}
                {(booking.status === 'REQUESTED' || booking.status === 'CONFIRMED') && (
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(booking.id)}
                    disabled={bookingActionPendingId === booking.id}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#6B8886] hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {tBooking('cancelBooking')}
                  </button>
                )}
              </div>
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
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8 pb-tabbar md:pb-8">
      <div className="max-w-[720px] mx-auto">

        {/* Email verification banner */}
        {emailVerified === false && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] border-l-4 border-[#F2C94C] rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] flex-1">{tAuth('verifyEmailBanner')}</p>
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
        <h1 className="text-[24px] font-medium text-[#0D1F1E] mb-8">
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
            {/* Tabs: Bookings / Messages */}
            <DashboardTabs
              idPrefix="customer-dashboard"
              ariaLabel={t('sectionsLabel')}
              activeKey={activeTab}
              onChange={key => setActiveTab(key as 'bookings' | 'messages')}
              tabs={[
                { key: 'bookings', label: tBooking('yourBookings'), count: bookingGroups.requested.length },
                { key: 'messages', label: t('messagesTab'), count: threads.filter(i => i.has_unread).length },
              ]}
            />

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
                  <p className="text-[14px] font-medium text-[#0D1F1E]">{tBooking('noBookingsYet')}</p>
                  <p className="text-[13px] text-[#6B8886]">{tBooking('noBookingsBodyCustomer')}</p>
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
                      <h3 className="text-[12px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">
                        {tBooking('awaitingConfirmation')}
                      </h3>
                      <div className="space-y-3">{bookingGroups.requested.map(renderBookingCard)}</div>
                    </div>
                  )}
                  {bookingGroups.confirmed.length > 0 && (
                    <div>
                      <h3 className="text-[12px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">
                        {tBooking('upcoming')}
                      </h3>
                      <div className="space-y-3">{bookingGroups.confirmed.map(renderBookingCard)}</div>
                    </div>
                  )}
                  {bookingGroups.history.length > 0 && (
                    <div>
                      <h3 className="text-[12px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">
                        {tBooking('bookingHistory')}
                      </h3>
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
                  <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 12L14 3l10 9v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                      <path d="M10 24V16h8v8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[16px] font-medium text-[#0D1F1E] mb-1">{t('noIntrosYet')}</p>
                    <p className="text-[13px] text-[#6B8886]">{t('noIntrosBody')}</p>
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
                                <p className="text-[15px] font-medium text-[#0D1F1E] truncate">{name}</p>
                                <p className="text-[12px] text-[#6B8886]">
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
                                <span key={city} className="inline-block bg-[#E6F1FF] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                                  {city}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Most recent message preview — hidden once the chat is open below */}
                          {!isChatOpen && (
                            <p className="text-[13px] text-[#6B8886] line-clamp-2 mt-2">{previewText}</p>
                          )}
                        </div>

                        {isChatOpen && (
                          // Full-screen takeover on mobile so the chat can't be
                          // accidentally scrolled past — inline expansion (desktop
                          // behavior, kept via md:) made it easy to scroll the chat
                          // out of view entirely on small screens.
                          <div className="max-md:fixed max-md:inset-0 max-md:z-[300] max-md:bg-white max-md:flex max-md:flex-col">
                            <ChatPanel
                              embedded
                              introductionId={intro.id}
                              currentUserId={session.user.id}
                              currentUserRole="CUSTOMER"
                              otherPartyName={cp?.display_name ?? 'Cleaner'}
                              otherPartyAvatar={cp?.photo_url ?? null}
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
          return {
            otherPartyName: b.cleaner_profiles?.display_name ?? '—',
            status:         b.status,
            date:           b.date,
            start_time:     b.start_time,
            duration_hours: b.duration_hours,
            bedrooms:       b.bedrooms,
            bathrooms:      b.bathrooms,
            cleaning_type:  b.cleaning_type,
            notes:          b.notes,
            address:        b.address,
            photo_urls:     b.photo_urls,
          }
        })()}
      />
    </div>
  )
}
