'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { BookingStatus } from '@/types'
import type { CleanerBookingActions, CleanerBookingRow } from '@/hooks/useCleanerBookingActions'

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

// Relative countdown to a confirmed job's start ("in 2 days", "in 6 hours"),
// added 2026-08-21 (Todoist "cleaner home view" spec). Computed on render,
// no ticking timer -- same lightweight approach as hoursLeftToRespond above
// and the admin disputes SLA countdown.
function jobCountdownLabel(date: string, startTime: string, tBooking: (key: string, values?: Record<string, number>) => string): string {
  const target = new Date(`${date}T${startTime}`).getTime()
  const diffMs = target - Date.now()
  if (diffMs <= 0) return tBooking('countdownNow')
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 60) return tBooking('countdownMinutes', { count: diffMin })
  const diffHours = Math.round(diffMs / 3600000)
  if (diffHours < 24) return tBooking('countdownHours', { count: diffHours })
  const diffDays = Math.round(diffMs / 86400000)
  return tBooking('countdownDays', { count: diffDays })
}

interface Props {
  booking:       CleanerBookingRow
  myProfileId:   string | undefined
  actions:       CleanerBookingActions
  onOpenDetail:  (bookingId: string) => void
}

// Extracted 2026-08-21 (Todoist "cleaner dashboard IA refactor") from what
// was a ~300-line inline renderBookingCard() on the old single-page
// /dashboard/cleaner -- now shared verbatim between the Home view's
// upcoming-only list and the Bookings view's full needs-response/upcoming/
// history groups, via useCleanerBookingActions for all the shared state.
export default function CleanerBookingCard({ booking, myProfileId, actions, onOpenDetail }: Props) {
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  const todayStr = new Date().toISOString().slice(0, 10)
  const dateReached = booking.date <= todayStr
  const hasEnoughPhotos = booking.photo_urls.length >= MIN_COMPLETION_PHOTOS
  const isPending = actions.bookingActionPendingId === booking.id
  const isUploadingPhoto = actions.photoUploadingId === booking.id
  // Other cleaners assigned to the same team job -- surfaced so a cleaner
  // isn't left thinking this is an ordinary solo booking when it isn't.
  const otherAssignees = (booking.booking_assignments ?? [])
    .filter(a => a.cleaner_profile_id !== myProfileId)
    .map(a => a.cleaner_profiles?.display_name)
    .filter((n): n is string => !!n)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(booking.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(booking.id) }
      }}
      aria-label={tBooking('with', { name: booking.users?.full_name ?? '—' })}
      className="card p-5 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">
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
          {booking.recurring_series?.status === 'ACTIVE' && (
            <span className="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300">
              {tBooking('recurringBadge')}
            </span>
          )}
          {booking.status === 'REQUESTED' && (
            <span className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE]">
              {hoursLeftToRespond(booking.created_at) > 0
                ? tBooking('timeLeftToRespond', { hours: hoursLeftToRespond(booking.created_at) })
                : tBooking('lessThanHourLeft')}
            </span>
          )}
        </div>

        {booking.status === 'REQUESTED' && actions.decliningId !== booking.id && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); actions.handleBookingAction(booking.id, 'CONFIRM') }}
              disabled={isPending}
              className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
            >
              {tBooking('confirm')}
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); actions.setDecliningId(booking.id) }}
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
              onClick={e => { e.stopPropagation(); actions.handleBookingAction(booking.id, 'COMPLETE') }}
              disabled={isPending}
              className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50 shrink-0"
            >
              {tBooking('markComplete')}
            </button>
          ) : !dateReached ? (
            <span className="text-[12px] font-medium text-[#19706A] shrink-0">
              {jobCountdownLabel(booking.date, booking.start_time, tBooking)}
            </span>
          ) : (
            <span className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] shrink-0">
              {tBooking('needMorePhotos', { count: MIN_COMPLETION_PHOTOS - booking.photo_urls.length })}
            </span>
          )
        )}
      </div>
      {booking.recurring_series?.status === 'ACTIVE' && (
        <div className="flex items-center gap-3 mb-1 flex-wrap" onClick={e => e.stopPropagation()}>
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
      {otherAssignees.length > 0 && (
        <p className="text-[12px] font-medium text-[#19706A] mb-1">
          {tBooking('alsoAssigned', { names: otherAssignees.join(', ') })}
        </p>
      )}
      {booking.status === 'COMPLETED' && (() => {
        const myAssignment = (booking.booking_assignments ?? []).find(a => a.cleaner_profile_id === myProfileId)
        const myFlag = myAssignment?.no_show_flags ?? null

        const otherFlags = (booking.booking_assignments ?? [])
          .filter(a => a.cleaner_profile_id !== myProfileId)
          .flatMap(a => a.no_show_flags ? [{ flag: a.no_show_flags, cleanerName: a.cleaner_profiles?.display_name ?? tBooking('unknownCleaner') }] : [])
          .filter(({ flag }) => flag.status === 'PENDING')

        return (
          <div className="space-y-2 mb-1" onClick={e => e.stopPropagation()}>
            {myFlag && (
              myFlag.status !== 'PENDING' ? (
                <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
                  {myFlag.status === 'CONFIRMED' ? tBooking('noShowConfirmedAgainstYou') : tBooking('noShowRejectedInYourFavor')}
                </p>
              ) : myFlag.cleaner_response ? (
                <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('noShowResponseSubmitted')}</p>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                  <p className="text-[12px] font-medium text-red-700">{tBooking('noShowFlaggedAgainstYou')}</p>
                  <p className="text-[12px] text-[#0D1F1E]">{myFlag.claim}</p>
                  {actions.contestingFlagId === myFlag.id ? (
                    <>
                      <textarea
                        value={actions.contestResponseText}
                        onChange={e => actions.setContestResponseText(e.target.value)}
                        placeholder={tBooking('contestPlaceholder')}
                        rows={2}
                        maxLength={2000}
                        className="input text-[13px]"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => actions.handleContestNoShow(booking.id, myFlag.id, actions.contestResponseText)}
                          disabled={actions.bookingActionPendingId === booking.id || !actions.contestResponseText.trim()}
                          className="text-[12px] font-medium text-[#19706A] hover:text-teal-700 transition-colors disabled:opacity-50"
                        >
                          {tBooking('submitContest')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { actions.setContestingFlagId(null); actions.setContestResponseText('') }}
                          className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] transition-colors"
                        >
                          {tBooking('neverMind')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { actions.setContestingFlagId(myFlag.id); actions.setContestResponseText('') }}
                      className="text-[12px] font-medium text-red-700 hover:text-red-800 transition-colors"
                    >
                      {tBooking('contestNoShow')}
                    </button>
                  )}
                </div>
              )
            )}
            {otherFlags.map(({ flag, cleanerName }) => {
              const already = (flag.no_show_corroborations ?? []).find(c => c.cleaner_profile_id === myProfileId)
              if (already) {
                return (
                  <p key={flag.id} className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
                    {tBooking('corroborationSubmitted', { name: cleanerName })}
                  </p>
                )
              }
              return (
                <div key={flag.id} className="rounded-lg border border-gold-200 bg-gold-50 dark:bg-[#332B0F] p-3 space-y-2">
                  <p className="text-[12px] font-medium text-gold-700 dark:text-gold-300">{tBooking('corroborationRequested', { name: cleanerName })}</p>
                  {actions.corroboratingFlagId === flag.id && (
                    <textarea
                      value={actions.corroborateNoteText}
                      onChange={e => actions.setCorroborateNoteText(e.target.value)}
                      placeholder={tBooking('corroborationNotePlaceholder')}
                      rows={2}
                      maxLength={1000}
                      className="input text-[13px]"
                    />
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => actions.corroboratingFlagId === flag.id
                        ? actions.handleCorroborateNoShow(booking.id, flag.id, 'CORROBORATES', actions.corroborateNoteText, myProfileId!)
                        : actions.setCorroboratingFlagId(flag.id)}
                      disabled={actions.bookingActionPendingId === booking.id}
                      className="text-[12px] font-medium text-[#19706A] hover:text-teal-700 transition-colors disabled:opacity-50"
                    >
                      {tBooking('confirmNoShow')}
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.corroboratingFlagId === flag.id
                        ? actions.handleCorroborateNoShow(booking.id, flag.id, 'DISPUTES', actions.corroborateNoteText, myProfileId!)
                        : actions.setCorroboratingFlagId(flag.id)}
                      disabled={actions.bookingActionPendingId === booking.id}
                      className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      {tBooking('disagreeNoShow')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
      {actions.decliningId === booking.id && (
        <div className="mb-2 space-y-2" onClick={e => e.stopPropagation()}>
          <textarea
            value={actions.declineReasonText}
            onChange={e => actions.setDeclineReasonText(e.target.value)}
            placeholder={tBooking('cancelReasonPlaceholder')}
            rows={2}
            maxLength={500}
            className="input text-[13px]"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => actions.handleBookingAction(booking.id, 'DECLINE', actions.declineReasonText)}
              disabled={isPending}
              className="text-[12px] font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
            >
              {tBooking('confirmDecline')}
            </button>
            <button
              type="button"
              onClick={() => { actions.setDecliningId(null); actions.setDeclineReasonText('') }}
              className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors"
            >
              {tBooking('neverMind')}
            </button>
          </div>
        </div>
      )}
      <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">
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
        <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] line-clamp-1 mt-0.5">📍 {booking.address}</p>
      )}
      {booking.notes && (
        <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] mt-1">{booking.notes}</p>
      )}
      {booking.status === 'CONFIRMED' && (
        <div className="mt-2">
          <p className="text-[11px] text-[#B8860B] bg-[#FDF8E1] dark:bg-[#332B0F] rounded-md px-2.5 py-1.5 mb-2">
            {tBooking('photoReminder')}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {booking.photo_urls.map((url, i) => (
              <img key={i} src={url} alt="" className="w-12 h-12 rounded-md object-cover border border-[#E0EDEC] dark:border-[#253634]" />
            ))}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); actions.handlePhotoAddClick(booking.id) }}
              disabled={isUploadingPhoto}
              aria-label="Add photo"
              className="w-12 h-12 rounded-md border border-dashed border-[#E0EDEC] dark:border-[#253634] flex items-center justify-center text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#19706A] hover:border-[#19706A] transition-colors disabled:opacity-50 text-[18px] leading-none"
            >
              {isUploadingPhoto ? '…' : '+'}
            </button>
          </div>
          <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mt-1">
            {tBooking('photoCount', { count: booking.photo_urls.length, min: MIN_COMPLETION_PHOTOS })}
          </p>
        </div>
      )}
    </div>
  )
}
