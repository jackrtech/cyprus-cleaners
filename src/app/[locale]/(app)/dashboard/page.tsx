'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { groupBookingsByPriority } from '@/lib/utils'
import { useCustomerBookingActions } from '@/hooks/useCustomerBookingActions'
import CustomerBookingCard from '@/components/dashboard/CustomerBookingCard'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'

// Home, added 2026-08-21 (Todoist "cleaner dashboard IA refactor", same
// treatment applied to the customer side) -- replaces the old single
// /dashboard page that Home and Bookings both aliased to (identical content,
// since the old activeTab only had 'bookings'/'messages' states and Home's
// bare URL fell through to the 'bookings' default). Now genuinely distinct:
// notifications/banners + upcoming-only bookings (no history). Full bookings
// incl. history live at /dashboard/bookings; messaging at /dashboard/messages
// -- neither shows any banner below.
export default function CustomerHomePage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('dashboard')
  const tAuth    = useTranslations('auth')
  const tBooking = useTranslations('booking')

  const router   = useRouter()
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)
  const actions = useCustomerBookingActions()

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resending,     setResending]     = useState(false)
  const [resendResult,  setResendResult]  = useState<'sent' | 'rate_limited' | null>(null)

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

  // (app)/layout.tsx already gates loading/auth — this is pure TS narrowing
  // for the session-shaped code below, never actually renders.
  if (!session) return null

  const bookingGroups = groupBookingsByPriority(actions.bookings)
  const reviewsNeededCount = bookingGroups.history.filter(b =>
    b.status === 'COMPLETED' && (!b.reviews || b.reviews.length === 0) && !b.review_skipped_at
  ).length

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto space-y-8">

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

        {/* Bookings awaiting the cleaner's confirmation — informational for
            the customer (nothing to action, they're just waiting), same
            visual pattern as the cleaner Home's notification banners. */}
        {bookingGroups.requested.length > 0 && (
          <div className="flex items-center gap-3 bg-gold-50 dark:bg-[#332B0F] border-l-4 border-gold-400 rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#B8860B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#B8860B" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tBooking('awaitingConfirmationBanner', { count: bookingGroups.requested.length })}</p>
            <Link href="/dashboard/bookings" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {tBooking('viewBookingsLink')}
            </Link>
          </div>
        )}

        {/* Completed jobs waiting on a review — actionable, so it's a
            notification here even though the actual ReviewPrompt UI lives
            on Bookings (under the relevant History card), not on Home. */}
        {reviewsNeededCount > 0 && (
          <div className="flex items-center gap-3 bg-[#F7FAF9] dark:bg-[#0F1817] border-l-4 border-[#19706A] rounded-lg p-4 mb-4 flex-wrap">
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tBooking('reviewsNeededBanner', { count: reviewsNeededCount })}</p>
            <Link href="/dashboard/bookings" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {tBooking('leaveReviewLink')}
            </Link>
          </div>
        )}

        {/* Page heading */}
        <h1 className="text-[24px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-8">
          {t('welcomeBack', { name: session.user.name })}
        </h1>

        {/* Upcoming bookings — soonest first, no history (see
            /dashboard/bookings for the full list). */}
        {actions.bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="card p-5 h-[80px] animate-pulse" />
            ))}
          </div>
        ) : bookingGroups.confirmed.length === 0 ? (
          <div className="card p-8 flex flex-col items-center text-center gap-2">
            <p className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{tBooking('noUpcomingBookings')}</p>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('noUpcomingBookingsBody')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.bookingActionError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {actions.bookingActionError}
              </p>
            )}
            {bookingGroups.confirmed.map(b => (
              <CustomerBookingCard key={b.id} booking={b} actions={actions} onOpenDetail={setViewingBookingId} />
            ))}
          </div>
        )}
      </div>

      <BookingDetailModal
        isOpen={!!viewingBookingId}
        onClose={() => setViewingBookingId(null)}
        booking={(() => {
          const b = actions.bookings.find(b => b.id === viewingBookingId)
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
          const b = actions.bookings.find(b => b.id === viewingBookingId)
          if (!b) return
          router.push(`/dashboard/messages?open=${b.introduction_id}`)
          setViewingBookingId(null)
        }}
      />
    </div>
  )
}
