'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { createClient } from '@/lib/supabase/client'
import { extractErrorMessage, groupBookingsByPriority } from '@/lib/utils'
import { compressImage } from '@/lib/utils/compressImage'
import ChatPanel from '@/components/chat/ChatPanel'
import DashboardTabs from '@/components/dashboard/DashboardTabs'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'
import type { BookingStatus, CleaningType } from '@/types'

interface CleanerProfile {
  slug:      string
  bio:       string | null
  photo_url: string | null
  cities:    string[] | null
}

interface IntroUser {
  full_name: string
}

interface LastMessage {
  body:       string | null
  photo_path: string | null
  created_at: string
}

interface Introduction {
  id:           string
  created_at:   string
  users:        IntroUser | null
  last_message: LastMessage | null
  has_unread:   boolean
}

interface Booking {
  id:             string
  status:         BookingStatus
  bedrooms:       number | null
  bathrooms:      number | null
  cleaning_type:  CleaningType | null
  date:           string
  start_time:     string
  duration_hours: number | null
  notes:          string | null
  address:        string | null
  created_at:     string
  users:          IntroUser | null
  photo_paths:    string[]
  photo_urls:     string[]
}

const MIN_COMPLETION_PHOTOS = 4

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  REQUESTED: 'badge-gold',
  CONFIRMED: 'badge-teal',
  COMPLETED: 'badge-blue',
  CANCELLED: 'bg-red-50 text-red-600',
}

function hoursLeftToRespond(createdAt: string): number {
  const deadline = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / (60 * 60 * 1000)))
}

interface IntroCardProps {
  intro:                Introduction
  tReceivedOn:          string
  tPhotoMessage:        string
  dateFormatter:        Intl.DateTimeFormat
  currentUserId:        string
  isChatOpen:           boolean
  onToggleChat:         () => void
}

function IntroCard({
  intro, tReceivedOn, tPhotoMessage, dateFormatter,
  currentUserId, isChatOpen, onToggleChat,
}: IntroCardProps) {
  const customerName = intro.users?.full_name ?? '—'
  const previewText = intro.last_message?.body ?? tPhotoMessage

  return (
    <div className="card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <p className="text-[15px] font-medium text-[#0D1F1E]">{customerName}</p>
            </div>
            <p className="text-[12px] text-[#6B8886]">
              {tReceivedOn} {dateFormatter.format(new Date(intro.created_at))}
            </p>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onToggleChat}
              className={`rounded-full px-4 py-2 text-[13px] ${
                isChatOpen ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {isChatOpen ? 'Close chat' : 'Open chat'}
            </button>
          </div>
        </div>

        {!isChatOpen && (
          <p className="text-[13px] text-[#6B8886] leading-relaxed line-clamp-2">{previewText}</p>
        )}
      </div>

      {isChatOpen && (
        // Full-screen takeover on mobile so the chat can't be accidentally
        // scrolled past — inline expansion (desktop behavior, kept via md:)
        // made it easy to scroll the chat out of view entirely on small screens.
        <div className="max-md:fixed max-md:inset-0 max-md:z-[300] max-md:bg-white max-md:flex max-md:flex-col">
          <ChatPanel
            embedded
            introductionId={intro.id}
            currentUserId={currentUserId}
            currentUserRole="CLEANER"
            otherPartyName={intro.users?.full_name ?? 'Customer'}
            otherPartyAvatar={null}
            onClose={onToggleChat}
          />
        </div>
      )}
    </div>
  )
}

export default function CleanerDashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('dashboard')
  const tAuth    = useTranslations('auth')
  const tBooking = useTranslations('booking')
  const tChat    = useTranslations('chat')
  const locale   = useLocale()
  const router   = useRouter()

  const [profile, setProfile] = useState<CleanerProfile | null>(null)
  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [bookings,        setBookings]        = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading]  = useState(true)
  const [bookingActionPendingId, setBookingActionPendingId] = useState<string | null>(null)
  const [bookingActionError,     setBookingActionError]     = useState<string | null>(null)

  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)
  const [photoUploadTargetId, setPhotoUploadTargetId] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resending,     setResending]     = useState(false)
  const [resendResult,  setResendResult]  = useState<'sent' | 'rate_limited' | null>(null)

  const [openChatId, setOpenChatId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'bookings' | 'messages'>('bookings')
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role === 'CUSTOMER') router.replace('/dashboard')
  }, [session, sessionStatus, router])

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

  async function handleBookingAction(bookingId: string, action: 'CONFIRM' | 'DECLINE' | 'COMPLETE') {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
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

  function handlePhotoAddClick(bookingId: string) {
    setPhotoUploadTargetId(bookingId)
    photoInputRef.current?.click()
  }

  async function handlePhotoFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const bookingId = photoUploadTargetId
    if (!file || !bookingId || photoUploadingId) return

    setPhotoUploadingId(bookingId)
    setPhotoUploadError(null)
    try {
      const compressed = await compressImage(file)
      const formData = new FormData()
      formData.append('photo', compressed)

      const res = await fetch(`/api/bookings/${bookingId}/photos`, {
        method: 'POST',
        body:   formData,
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('photoUploadError')))

      const result: { photo_paths: string[]; new_photo_url: string | null } = await res.json()
      setBookings(prev => prev.map(b => b.id !== bookingId ? b : {
        ...b,
        photo_paths: result.photo_paths,
        photo_urls: result.new_photo_url ? [...b.photo_urls, result.new_photo_url] : b.photo_urls,
      }))
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : tBooking('photoUploadError'))
    } finally {
      setPhotoUploadingId(null)
      setPhotoUploadTargetId(null)
      e.target.value = ''
    }
  }

  // Parallel fetch: intros from API + profile from Supabase
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return

    // A token is required so RLS's cleaner_profiles_select_own policy can
    // resolve auth.uid() — otherwise only ACTIVE profiles are visible, which
    // silently hides the profile for cleaners still pending approval.
    Promise.all([
      fetch('/api/introductions')
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/supabase-token')
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .then(({ token }: { token: string }) =>
          createClient(token)
            .from('cleaner_profiles')
            .select('slug, bio, photo_url, cities')
            .eq('user_id', session.user.id)
            .single()
            .then(({ data }) => data)
        ),
    ])
      .then(([introData, profileData]) => {
        if (Array.isArray(introData)) setIntros(introData)
        if (profileData) setProfile(profileData as CleanerProfile)
      })
      .catch(() => setError('Failed to load dashboard data. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  // Fetch bookings once confirmed CLEANER
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return
    fetch('/api/bookings')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setBookings(data) })
      .catch(() => {})
      .finally(() => setBookingsLoading(false))
  }, [session, sessionStatus])

  if (sessionStatus === 'loading' || !session || session.user.role === 'CUSTOMER') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const profileIncomplete =
    !profile?.bio || !profile?.photo_url || !profile?.cities || profile.cities.length === 0

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const threads       = intros.filter(i => i.last_message !== null)
  const bookingGroups = groupBookingsByPriority(bookings)

  function renderBookingCard(booking: Booking) {
    const todayStr = new Date().toISOString().slice(0, 10)
    const dateReached = booking.date <= todayStr
    const hasEnoughPhotos = booking.photo_urls.length >= MIN_COMPLETION_PHOTOS
    const isPending = bookingActionPendingId === booking.id
    const isUploadingPhoto = photoUploadingId === booking.id

    return (
      <div key={booking.id} className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-medium text-[#0D1F1E]">
              {tBooking('with', { name: booking.users?.full_name ?? '—' })}
            </p>
            <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${BOOKING_STATUS_BADGE[booking.status]}`}>
              {tBooking(
                booking.status === 'REQUESTED' ? 'statusRequested'
                : booking.status === 'CONFIRMED' ? 'statusConfirmed'
                : booking.status === 'COMPLETED' ? 'statusCompleted'
                : 'statusCancelled'
              )}
            </span>
            {booking.status === 'REQUESTED' && (
              <span className="text-[11px] text-[#6B8886]">
                {hoursLeftToRespond(booking.created_at) > 0
                  ? tBooking('timeLeftToRespond', { hours: hoursLeftToRespond(booking.created_at) })
                  : tBooking('lessThanHourLeft')}
              </span>
            )}
          </div>

          {booking.status === 'REQUESTED' && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleBookingAction(booking.id, 'CONFIRM')}
                disabled={isPending}
                className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
              >
                {tBooking('confirm')}
              </button>
              <button
                type="button"
                onClick={() => handleBookingAction(booking.id, 'DECLINE')}
                disabled={isPending}
                className="btn-ghost !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
              >
                {tBooking('decline')}
              </button>
            </div>
          )}
          {booking.status === 'CONFIRMED' && (
            dateReached && hasEnoughPhotos ? (
              <button
                type="button"
                onClick={() => handleBookingAction(booking.id, 'COMPLETE')}
                disabled={isPending}
                className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50 shrink-0"
              >
                {tBooking('markComplete')}
              </button>
            ) : !dateReached ? (
              <span className="text-[12px] text-[#6B8886] shrink-0">
                {tBooking('notYetDue', {
                  date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${booking.date}T00:00:00`)),
                })}
              </span>
            ) : (
              <span className="text-[12px] text-[#6B8886] shrink-0">
                {tBooking('needMorePhotos', { count: MIN_COMPLETION_PHOTOS - booking.photo_urls.length })}
              </span>
            )
          )}
        </div>
        <p className="text-[13px] text-[#6B8886]">
          {tBooking(booking.duration_hours == null ? 'summaryNoDuration' : 'summary', {
            cleaningType: tBooking(booking.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
            bedrooms: booking.bedrooms ?? '—',
            bathrooms: booking.bathrooms ?? '—',
            date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${booking.date}T00:00:00`)),
            time: booking.start_time.slice(0, 5),
            duration: booking.duration_hours ?? undefined,
          })}
        </p>
        {booking.address && (
          <p className="text-[12px] text-[#6B8886] line-clamp-1 mt-0.5">📍 {booking.address}</p>
        )}
        {booking.notes && (
          <p className="text-[12px] text-[#6B8886] mt-1">{booking.notes}</p>
        )}
        {booking.status === 'CONFIRMED' && (
          <div className="mt-2">
            <p className="text-[11px] text-[#B8860B] bg-[#FDF8E1] rounded-md px-2.5 py-1.5 mb-2">
              {tBooking('photoReminder')}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {booking.photo_urls.map((url, i) => (
                <img key={i} src={url} alt="" className="w-12 h-12 rounded-md object-cover border border-[#E0EDEC]" />
              ))}
              <button
                type="button"
                onClick={() => handlePhotoAddClick(booking.id)}
                disabled={isUploadingPhoto}
                aria-label="Add photo"
                className="w-12 h-12 rounded-md border border-dashed border-[#E0EDEC] flex items-center justify-center text-[#6B8886] hover:text-[#19706A] hover:border-[#19706A] transition-colors disabled:opacity-50 text-[18px] leading-none"
              >
                {isUploadingPhoto ? '…' : '+'}
              </button>
            </div>
            <p className="text-[11px] text-[#6B8886] mt-1">
              {tBooking('photoCount', { count: booking.photo_urls.length, min: MIN_COMPLETION_PHOTOS })}
            </p>
          </div>
        )}
        {/* Photos aren't fetched into the DOM until this is clicked — see
            BookingDetailModal. Shown for every booking, not just completed
            ones, so full details are reachable consistently regardless of
            status. */}
        <button
          type="button"
          onClick={() => setViewingBookingId(booking.id)}
          className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-medium text-[#19706A] hover:underline"
        >
          {tBooking('viewDetails')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto space-y-8">

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

        {/* SECTION 1 — Profile completion banner */}
        {!loading && profileIncomplete && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] border-l-4 border-[#F2C94C] rounded-lg px-5 py-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] flex-1">{t('completeProfileBanner')}</p>
            <Link href="/dashboard/cleaner/edit" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {t('editProfile')}
            </Link>
          </div>
        )}

        {/* Profile quick actions — moved near the top so they're reachable without scrolling past bookings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/dashboard/cleaner/edit"
            className="card p-5 flex items-center gap-3 hover:shadow-md transition-shadow"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11.5 2a1.5 1.5 0 0 1 2.12 2.12L4.5 13.24l-3 .75.75-3L11.5 2z" />
            </svg>
            <span className="text-[14px] text-[#0D1F1E]">{t('editProfile')}</span>
          </Link>

          {profile?.slug ? (
            <Link
              href={`/cleaners/${profile.slug}`}
              className="card p-5 flex items-center gap-3 hover:shadow-md transition-shadow"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 2.5H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5M9.5 1H15v5.5M15 1l-7 7" />
              </svg>
              <span className="text-[14px] text-[#0D1F1E]">{t('viewPublicProfile')}</span>
            </Link>
          ) : (
            <div className="card p-5 flex items-center gap-3 opacity-40 cursor-not-allowed select-none">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 2.5H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5M9.5 1H15v5.5M15 1l-7 7" />
              </svg>
              <span className="text-[14px] text-[#0D1F1E]">{t('viewPublicProfile')}</span>
            </div>
          )}
        </div>

        {/* Inline error */}
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
            {error}
          </p>
        )}

        {/* Tabs: Bookings / Messages */}
        <DashboardTabs
          idPrefix="cleaner-dashboard"
          ariaLabel={t('sectionsLabel')}
          activeKey={activeTab}
          onChange={key => setActiveTab(key as 'bookings' | 'messages')}
          tabs={[
            { key: 'bookings', label: tBooking('bookingRequests'), count: bookingGroups.requested.length },
            { key: 'messages', label: t('messagesTab'), count: threads.filter(i => i.has_unread).length },
          ]}
        />

        {/* Messages panel */}
        <section
          role="tabpanel"
          id="cleaner-dashboard-panel-messages"
          aria-labelledby="cleaner-dashboard-tab-messages"
          hidden={activeTab !== 'messages'}
        >
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="card p-5 h-[100px] animate-pulse" />
              ))}
            </div>
          ) : threads.length === 0 && !error ? (
            <div className="card p-10 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M24 3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4l3 4 3-4h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" />
                </svg>
              </div>
              <div>
                <p className="text-[16px] font-medium text-[#0D1F1E] mb-1">{t('noIntroRequestsYet')}</p>
                <p className="text-[13px] text-[#6B8886]">{t('noIntroRequestsBody')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map(intro => (
                <IntroCard
                  key={intro.id}
                  intro={intro}
                  tReceivedOn={t('receivedOn')}
                  tPhotoMessage={tChat('photoMessage')}
                  dateFormatter={dateFormatter}
                  currentUserId={session.user.id}
                  isChatOpen={openChatId === intro.id}
                  onToggleChat={() => setOpenChatId(openChatId === intro.id ? null : intro.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Bookings panel */}
        <section
          role="tabpanel"
          id="cleaner-dashboard-panel-bookings"
          aria-labelledby="cleaner-dashboard-tab-bookings"
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
              <p className="text-[13px] text-[#6B8886]">{tBooking('noBookingsBodyCleaner')}</p>
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
                    {tBooking('needsResponse')}
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
              {photoUploadError && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                  {photoUploadError}
                </p>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoFileSelect}
                className="hidden"
              />
            </div>
          )}
        </section>

        {/* Sign out */}
        <div className="text-center">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-[13px] text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
          >
            {t('signOut')}
          </button>
        </div>

      </div>

      <BookingDetailModal
        isOpen={!!viewingBookingId}
        onClose={() => setViewingBookingId(null)}
        booking={(() => {
          const b = bookings.find(b => b.id === viewingBookingId)
          if (!b) return null
          return {
            otherPartyName: b.users?.full_name ?? '—',
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
