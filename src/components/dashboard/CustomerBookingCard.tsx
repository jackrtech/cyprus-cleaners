'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/navigation'
import type { BookingStatus } from '@/types'
import ReviewPrompt from '@/components/reviews/ReviewPrompt'
import type { CustomerBookingActions, CustomerBookingRow } from '@/hooks/useCustomerBookingActions'

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  REQUESTED: 'badge-gold',
  CONFIRMED: 'badge-teal',
  COMPLETED: 'badge-blue',
  CANCELLED: 'bg-red-50 text-red-600',
}

interface Props {
  booking:      CustomerBookingRow
  actions:      CustomerBookingActions
  onOpenDetail: (bookingId: string) => void
}

// Extracted 2026-08-21 (Todoist "cleaner dashboard IA refactor", same
// treatment applied to the customer side) from what was an inline
// renderBookingCard() on the old single-page /dashboard -- now shared
// between the Home view's upcoming-only list and the Bookings view's full
// awaiting-confirmation/upcoming/history groups, via useCustomerBookingActions
// for all the shared state.
export default function CustomerBookingCard({ booking, actions, onOpenDetail }: Props) {
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  const cp = booking.cleaner_profiles
  // Multi-cleaner bookings have no single cleaner_profiles row -- join the
  // assigned cleaners' names instead of falling back to a blank "-".
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
    && !actions.skippedReviewIds.has(booking.id)

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(booking.id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(booking.id) }
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
              {booking.recurring_series?.status === 'ACTIVE' && (
                <span className="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300">
                  {tBooking('recurringBadge')}
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{bookingSummary}</p>
            {booking.address && (
              <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] line-clamp-1 mt-0.5">📍 {booking.address}</p>
            )}
            {(booking.status === 'REQUESTED' || booking.status === 'CONFIRMED') && (
              actions.cancellingId === booking.id ? (
                <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                  <textarea
                    value={actions.cancelReasonText}
                    onChange={e => actions.setCancelReasonText(e.target.value)}
                    placeholder={tBooking('cancelReasonPlaceholder')}
                    rows={2}
                    maxLength={500}
                    className="input text-[13px]"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => actions.handleCancelBooking(booking.id, actions.cancelReasonText)}
                      disabled={actions.bookingActionPendingId === booking.id}
                      className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      {tBooking('confirmCancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { actions.setCancellingId(null); actions.setCancelReasonText('') }}
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
                    onClick={e => { e.stopPropagation(); actions.setCancellingId(booking.id) }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {tBooking('cancelBooking')}
                  </button>
                </div>
              )
            )}
            {booking.recurring_series?.status === 'ACTIVE' && (
              <div className="flex items-center gap-3 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
                {actions.skippedSeriesIds.has(booking.recurring_series.id) ? (
                  <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('nextOccurrenceSkipped')}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => actions.handleSkipNextOccurrence(booking.recurring_series!.id)}
                    disabled={actions.recurringActionPendingId === booking.recurring_series.id}
                    className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors disabled:opacity-50"
                  >
                    {tBooking('skipNextOccurrence')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => actions.handleCancelSeries(booking.recurring_series!.id)}
                  disabled={actions.recurringActionPendingId === booking.recurring_series.id}
                  className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {tBooking('cancelSeries')}
                </button>
              </div>
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
              ) : actions.disputingId === booking.id ? (
                <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                  <textarea
                    value={actions.disputeClaimText}
                    onChange={e => actions.setDisputeClaimText(e.target.value)}
                    placeholder={tBooking('disputeClaimPlaceholder')}
                    rows={2}
                    maxLength={2000}
                    className="input text-[13px]"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => actions.handleFileDispute(booking.id, actions.disputeClaimText)}
                      disabled={actions.bookingActionPendingId === booking.id || !actions.disputeClaimText.trim()}
                      className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      {tBooking('submitDispute')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { actions.setDisputingId(null); actions.setDisputeClaimText('') }}
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
                    onClick={e => { e.stopPropagation(); actions.setDisputingId(booking.id) }}
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
                <div className="mt-2 flex flex-col items-start gap-1.5" onClick={e => e.stopPropagation()}>
                  {booking.booking_assignments!.map(a => {
                    const name = a.cleaner_profiles?.display_name ?? tBooking('unknownCleaner')
                    const flag = a.no_show_flags ?? null
                    if (flag) {
                      return (
                        <p key={a.id} className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
                          {tBooking('noShowFlagged', { name })}
                        </p>
                      )
                    }
                    if (windowExpired) return null
                    if (actions.flaggingAssignmentId === a.id) {
                      return (
                        <div key={a.id} className="space-y-2">
                          <textarea
                            value={actions.noShowClaimText}
                            onChange={e => actions.setNoShowClaimText(e.target.value)}
                            placeholder={tBooking('noShowClaimPlaceholder', { name })}
                            rows={2}
                            maxLength={2000}
                            className="input text-[13px]"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => actions.handleFileNoShow(booking.id, a.id, actions.noShowClaimText)}
                              disabled={actions.bookingActionPendingId === booking.id || !actions.noShowClaimText.trim()}
                              className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                            >
                              {tBooking('submitNoShow')}
                            </button>
                            <button
                              type="button"
                              onClick={() => { actions.setFlaggingAssignmentId(null); actions.setNoShowClaimText('') }}
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
                        onClick={e => { e.stopPropagation(); actions.setFlaggingAssignmentId(a.id); actions.setNoShowClaimText('') }}
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
            actions.setBookings(prev => prev.map(b =>
              b.id === booking.id ? { ...b, reviews: [{ id: review.id }] } : b
            ))
          }}
          onSkip={() => actions.setSkippedReviewIds(prev => new Set(prev).add(booking.id))}
        />
      )}
    </div>
  )
}
