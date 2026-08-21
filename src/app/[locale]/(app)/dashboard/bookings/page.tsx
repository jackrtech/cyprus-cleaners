'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'
import { groupBookingsByPriority } from '@/lib/utils'
import { useCustomerBookingActions } from '@/hooks/useCustomerBookingActions'
import CustomerBookingCard from '@/components/dashboard/CustomerBookingCard'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'

// Real route, added 2026-08-21 (Todoist "cleaner dashboard IA refactor",
// same treatment applied to the customer side) -- carries the full bookings
// content (awaiting-confirmation/upcoming/history) that used to live behind
// ?tab=bookings on the single /dashboard page. No banners, no welcome
// heading here by design -- those are Home's job now (see /dashboard).
export default function CustomerBookingsPage() {
  const { data: session } = useSession()
  const t        = useTranslations('dashboard')
  const tBooking = useTranslations('booking')
  const router   = useRouter()

  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)
  const actions = useCustomerBookingActions()

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
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('noBookingsBodyCustomer')}</p>
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
                  {tBooking('awaitingConfirmation')}
                </h2>
                <div className="space-y-3">
                  {bookingGroups.requested.map(b => (
                    <CustomerBookingCard key={b.id} booking={b} actions={actions} onOpenDetail={setViewingBookingId} />
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
                    <CustomerBookingCard key={b.id} booking={b} actions={actions} onOpenDetail={setViewingBookingId} />
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
                    <CustomerBookingCard key={b.id} booking={b} actions={actions} onOpenDetail={setViewingBookingId} />
                  ))}
                </div>
              </div>
            )}
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
