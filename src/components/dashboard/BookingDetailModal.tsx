'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { BookingStatus, CleaningType } from '@/types'
import FullScreenModal from '@/components/ui/FullScreenModal'

export interface BookingDetailData {
  otherPartyName: string
  status:         BookingStatus
  date:           string
  start_time:     string
  duration_hours: number | null
  bedrooms:       number | null
  bathrooms:      number | null
  cleaning_type:  CleaningType | null
  notes:          string | null
  address:        string | null
  photo_urls:     string[]
}

interface Props {
  isOpen:  boolean
  onClose: () => void
  booking: BookingDetailData | null
}

const STATUS_BADGE: Record<BookingStatus, string> = {
  REQUESTED: 'badge-gold',
  CONFIRMED: 'badge-teal',
  COMPLETED: 'badge-blue',
  CANCELLED: 'bg-red-50 text-red-600',
}

const STATUS_KEY: Record<BookingStatus, string> = {
  REQUESTED: 'statusRequested',
  CONFIRMED: 'statusConfirmed',
  COMPLETED: 'statusCompleted',
  CANCELLED: 'statusCancelled',
}

// Detail view for a single booking (any status) — full-screen on mobile,
// centered card on desktop (see FullScreenModal). Reachable from both the
// dashboard's "Your bookings" list and a chat thread's booking history, so a
// booking looked up from either place shows the same thing: full details
// plus job photos, the latter only fetched into the DOM once this is opened.
export default function BookingDetailModal({ isOpen, onClose, booking }: Props) {
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  if (!booking) return null

  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <FullScreenModal isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0EDEC] shrink-0">
        <span className="text-[14px] font-medium text-[#0D1F1E] truncate">
          {tBooking('with', { name: booking.otherPartyName })}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] border border-[#E0EDEC] text-[#6B8886] hover:text-[#0D1F1E] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0 ml-2"
        >
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${STATUS_BADGE[booking.status]}`}>
          {tBooking(STATUS_KEY[booking.status])}
        </span>

        <div className="text-[14px] text-[#0D1F1E] space-y-2">
          <p>
            {tBooking(booking.duration_hours == null ? 'summaryNoDuration' : 'summary', {
              cleaningType: tBooking(booking.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
              bedrooms:  booking.bedrooms ?? '—',
              bathrooms: booking.bathrooms ?? '—',
              date:      dateFmt.format(new Date(`${booking.date}T00:00:00`)),
              time:      booking.start_time.slice(0, 5),
              duration:  booking.duration_hours ?? undefined,
            })}
          </p>
          <div>
            <p className="text-[12px] font-medium text-[#6B8886] mb-0.5">{tBooking('propertyAddress')}</p>
            <p className="text-[13px] text-[#0D1F1E]">{booking.address ?? tBooking('noAddressProvided')}</p>
          </div>
          {booking.notes && (
            <p className="text-[13px] text-[#6B8886] whitespace-pre-wrap">{booking.notes}</p>
          )}
        </div>

        {booking.photo_urls.length > 0 && (
          <div>
            <p className="text-[12px] font-medium text-[#6B8886] mb-2">{tBooking('jobPhotos')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {booking.photo_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" className="w-full aspect-square rounded-lg object-cover border border-[#E0EDEC]" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </FullScreenModal>
  )
}
