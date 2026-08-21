'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { groupBookingsByPriority } from '@/lib/utils'
import { useCleanerBookingActions } from '@/hooks/useCleanerBookingActions'
import CleanerBookingCard from '@/components/dashboard/CleanerBookingCard'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'

// Real route, added 2026-08-21 (Todoist "cleaner dashboard IA refactor") --
// carries the full bookings content (needs-response/upcoming/history) that
// used to live behind ?tab=bookings on the single /dashboard/cleaner page.
// No banners, no welcome heading, no invite-a-cleaner card here by design --
// those are Home's job now (see /dashboard/cleaner/page.tsx).
export default function CleanerBookingsPage() {
  const { data: session } = useSession()
  const t        = useTranslations('dashboard')
  const tBooking = useTranslations('booking')

  const [profileId, setProfileId] = useState<string | undefined>(undefined)
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)
  const actions = useCleanerBookingActions()

  useEffect(() => {
    if (session?.user.role !== 'CLEANER') return
    fetch('/api/cleaner-profiles/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setProfileId(d.id) })
      .catch(() => {})
  }, [session])

  if (!session) return null

  const bookingGroups = groupBookingsByPriority(actions.bookings)

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto space-y-8">
        <h1 className="text-[24px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{t('bookingsTab')}</h1>

        {actions.bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="card p-5 h-[80px] animate-pulse" />
            ))}
          </div>
        ) : actions.bookings.length === 0 ? (
          <div className="card p-8 flex flex-col items-center text-center gap-2">
            <p className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{tBooking('noBookingsYet')}</p>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('noBookingsBodyCleaner')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {actions.bookingActionError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {actions.bookingActionError}
              </p>
            )}
            {bookingGroups.requested.length > 0 && (
              <div>
                <h2 className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] uppercase tracking-wide mb-3">
                  {tBooking('needsResponse')}
                </h2>
                <div className="space-y-3">
                  {bookingGroups.requested.map(b => (
                    <CleanerBookingCard key={b.id} booking={b} myProfileId={profileId} actions={actions} onOpenDetail={setViewingBookingId} />
                  ))}
                </div>
              </div>
            )}
            {bookingGroups.confirmed.length > 0 && (
              <div>
                <h2 className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] uppercase tracking-wide mb-3">
                  {tBooking('upcoming')}
                </h2>
                <div className="space-y-3">
                  {bookingGroups.confirmed.map(b => (
                    <CleanerBookingCard key={b.id} booking={b} myProfileId={profileId} actions={actions} onOpenDetail={setViewingBookingId} />
                  ))}
                </div>
              </div>
            )}
            {bookingGroups.history.length > 0 && (
              <div>
                <h2 className="text-[12px] font-medium text-[#5B7472] dark:text-[#9BB0AE] uppercase tracking-wide mb-3">
                  {tBooking('bookingHistory')}
                </h2>
                <div className="space-y-3">
                  {bookingGroups.history.map(b => (
                    <CleanerBookingCard key={b.id} booking={b} myProfileId={profileId} actions={actions} onOpenDetail={setViewingBookingId} />
                  ))}
                </div>
              </div>
            )}
            {actions.photoUploadError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {actions.photoUploadError}
              </p>
            )}
            <input
              ref={actions.photoInputRef}
              type="file"
              accept="image/*"
              onChange={actions.handlePhotoFileSelect}
              className="hidden"
            />
          </div>
        )}
      </div>

      <BookingDetailModal
        isOpen={!!viewingBookingId}
        onClose={() => setViewingBookingId(null)}
        booking={(() => {
          const b = actions.bookings.find(b => b.id === viewingBookingId)
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
            addressLat:     b.address_lat,
            addressLng:     b.address_lng,
            findingUsNotes: b.finding_us_notes,
            photo_urls:     b.photo_urls,
            cancellationReason: b.cancellation_reason,
          }
        })()}
      />
    </div>
  )
}
