'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/navigation'
import type { BookingStatus, CleaningType } from '@/types'
import FullScreenModal from '@/components/ui/FullScreenModal'
import LoadingImage from '@/components/ui/LoadingImage'

export interface BookingDetailData {
  otherPartyName:     string
  otherPartyPhotoUrl?: string | null
  otherPartySlug?:    string | null
  status:             BookingStatus
  date:               string
  start_time:         string
  duration_hours:     number | null
  bedrooms:           number | null
  bathrooms:          number | null
  cleaning_type:      CleaningType | null
  notes:              string | null
  address:            string | null
  addressLat?:        number | null
  addressLng?:        number | null
  findingUsNotes?:    string | null
  photo_urls:         string[]
  cancellationReason?: string | null
}

interface Props {
  isOpen:      boolean
  onClose:     () => void
  booking:     BookingDetailData | null
  onBookAgain?: () => void
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

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
      <path d="M8 14.5S13 10 13 6.5a5 5 0 1 0-10 0C3 10 8 14.5 8 14.5z" />
      <circle cx="8" cy="6.5" r="1.75" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
      <rect x="3" y="2.5" width="10" height="12" rx="1.5" />
      <path d="M6 2v-.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V2M5.5 7h5M5.5 9.5h5M5.5 12h3" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6B8886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M2 5.5a1 1 0 0 1 1-1h1.5l1-1.5h5l1 1.5H13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7z" />
      <circle cx="8" cy="9" r="2.5" />
    </svg>
  )
}

// Detail view for a single booking (any status) — full-screen on mobile,
// centered card on desktop (see FullScreenModal). Reachable from both the
// dashboard's "Your bookings" list and a chat thread's booking history, so a
// booking looked up from either place shows the same thing: full details
// plus job photos, the latter only fetched into the DOM once this is opened.
export default function BookingDetailModal({ isOpen, onClose, booking, onBookAgain }: Props) {
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  if (!booking) return null

  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const showBookAgain = !!onBookAgain

  return (
    <FullScreenModal isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0EDEC] shrink-0">
        {(() => {
          const avatar = (
            <div className="shrink-0 w-10 h-10 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[13px] font-medium overflow-hidden">
              {booking.otherPartyPhotoUrl
                ? <LoadingImage src={booking.otherPartyPhotoUrl} wrapperClassName="w-full h-full" className="object-cover" />
                : getInitials(booking.otherPartyName)}
            </div>
          )
          const name = (
            <span className="flex-1 min-w-0 text-[14px] font-medium text-[#0D1F1E] truncate">
              {tBooking('with', { name: booking.otherPartyName })}
            </span>
          )
          return booking.otherPartySlug ? (
            <Link href={`/cleaners/${booking.otherPartySlug}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
              {avatar}
              {name}
            </Link>
          ) : (
            <>
              {avatar}
              {name}
            </>
          )
        })()}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] border border-[#E0EDEC] text-[#6B8886] hover:text-[#0D1F1E] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0"
        >
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${STATUS_BADGE[booking.status]}`}>
          {tBooking(STATUS_KEY[booking.status])}
        </span>

        {booking.status === 'CANCELLED' && booking.cancellationReason && (
          <div>
            <p className="text-[12px] font-medium text-[#6B8886] mb-0.5">{tBooking('cancellationReason')}</p>
            <p className="text-[13px] text-[#0D1F1E] bg-[#F7FAF9] rounded-lg p-3">{booking.cancellationReason}</p>
          </div>
        )}

        <div className="flex items-start gap-2.5">
          <CalendarIcon />
          <p className="text-[14px] text-[#0D1F1E]">
            {tBooking(booking.duration_hours == null ? 'summaryNoDuration' : 'summary', {
              cleaningType: tBooking(booking.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
              bedrooms:  booking.bedrooms ?? '—',
              bathrooms: booking.bathrooms ?? '—',
              date:      dateFmt.format(new Date(`${booking.date}T00:00:00`)),
              time:      booking.start_time.slice(0, 5),
              duration:  booking.duration_hours ?? undefined,
            })}
          </p>
        </div>

        <div className="flex items-start gap-2.5">
          <PinIcon />
          <div>
            <p className="text-[12px] font-medium text-[#6B8886] mb-0.5">{tBooking('propertyAddress')}</p>
            <p className="text-[13px] text-[#0D1F1E]">{booking.address ?? tBooking('noAddressProvided')}</p>
            {booking.addressLat != null && booking.addressLng != null && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${booking.addressLat}&mlon=${booking.addressLng}#map=17/${booking.addressLat}/${booking.addressLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#19706A] hover:underline inline-block mt-0.5"
              >
                {tBooking('viewOnMap')}
              </a>
            )}
            {booking.findingUsNotes && (
              <p className="text-[13px] text-[#0D1F1E] bg-[#F7FAF9] rounded-lg p-3 mt-2">{booking.findingUsNotes}</p>
            )}
          </div>
        </div>

        {booking.notes && (
          <div className="flex items-start gap-2.5">
            <NoteIcon />
            <p className="flex-1 text-[13px] text-[#0D1F1E] whitespace-pre-wrap bg-[#F7FAF9] rounded-lg p-3">
              {booking.notes}
            </p>
          </div>
        )}

        {booking.photo_urls.length > 0 && (
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <CameraIcon />
              <p className="text-[12px] font-medium text-[#6B8886]">{tBooking('jobPhotos')}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {booking.photo_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <LoadingImage
                    src={url}
                    wrapperClassName="w-full aspect-square rounded-lg border border-[#E0EDEC]"
                    className="object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {showBookAgain && (
        <div className="px-4 py-3 border-t border-[#E0EDEC] shrink-0">
          <button type="button" onClick={onBookAgain} className="btn-primary w-full">
            {tBooking('bookAgain')}
          </button>
        </div>
      )}
    </FullScreenModal>
  )
}
