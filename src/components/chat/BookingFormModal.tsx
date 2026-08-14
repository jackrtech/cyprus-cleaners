'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { extractErrorMessage, estimateCleaningHours } from '@/lib/utils'
import FullScreenModal from '@/components/ui/FullScreenModal'
import AddressFormModal, { type SavedAddress } from '@/components/addresses/AddressFormModal'
import BookingPaymentElement, { type BookingPaymentHandle } from '@/components/chat/BookingPaymentElement'
import type { BookingStatus, CleaningType } from '@/types'

interface Booking {
  id:              string
  status:          BookingStatus
  bedrooms:        number | null
  bathrooms:       number | null
  cleaning_type:   CleaningType | null
  date:            string
  start_time:      string
  duration_hours:  number | null
  notes:           string | null
  address:         string | null
  address_lat:     number | null
  address_lng:     number | null
  finding_us_notes: string | null
  created_at:      string
  photo_paths:     string[]
  photo_urls:      string[]
}

// Quarter-hour slots covering a typical working day, 07:00–20:00
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = []
  for (let minutes = 7 * 60; minutes <= 20 * 60; minutes += 15) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0')
    const m = String(minutes % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
  }
  return slots
})()

interface Props {
  isOpen:            boolean
  onClose:           () => void
  introductionId:    string
  cleanerName:       string
  onBookingCreated:  (booking: Booking) => void
}

// Its own full-screen modal, separate from the chat thread — the booking
// form has enough fields (room count, duration, date/time, address+map,
// payment) that sharing space with the chat header made it feel cramped
// and secondary. Opened from ChatPanel's "Book"/"Book again" CTA.
export default function BookingFormModal({ isOpen, onClose, introductionId, cleanerName, onBookingCreated }: Props) {
  const tBooking = useTranslations('booking')
  const tAddr    = useTranslations('address')

  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingError,      setBookingError]      = useState<string | null>(null)

  const [bedrooms,        setBedrooms]        = useState('1')
  const [bathrooms,       setBathrooms]       = useState('1')
  const [cleaningType,    setCleaningType]    = useState<CleaningType>('STANDARD')
  const [bookingDate,     setBookingDate]     = useState('')
  const [startTime,       setStartTime]       = useState('')
  const [durationHours,   setDurationHours]   = useState(String(estimateCleaningHours(1, 1, 'STANDARD')))
  const [durationTouched, setDurationTouched] = useState(false)
  const [bookingNotes,    setBookingNotes]    = useState('')

  const ADD_NEW_ADDRESS = '__add_new__'
  const [savedAddresses,    setSavedAddresses]    = useState<SavedAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [showAddressModal,  setShowAddressModal]  = useState(false)

  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null)
  const paymentHandleRef = useRef<BookingPaymentHandle | null>(null)

  const selectedAddress = savedAddresses.find(a => a.id === selectedAddressId) ?? null
  const todayStr = new Date().toISOString().slice(0, 10)

  // Pre-fill the duration estimate as room count/type change, but stop
  // overwriting it once the customer has edited it themselves
  useEffect(() => {
    if (durationTouched) return
    setDurationHours(String(estimateCleaningHours(Number(bedrooms) || 0, Number(bathrooms) || 0, cleaningType)))
  }, [bedrooms, bathrooms, cleaningType, durationTouched])

  // Fetch the customer's saved addresses once the form opens — with exactly
  // one on file, pre-select it; with several, pre-select whichever is marked
  // default; with zero or several-and-no-default, leave it unselected so a
  // customer with multiple properties has to pick explicitly rather than
  // risk a cleaner going to the wrong address.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetch('/api/addresses')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: SavedAddress[]) => {
        if (cancelled) return
        setSavedAddresses(data)
        const preselect = data.length === 1 ? data[0] : data.find(a => a.is_default)
        if (preselect) setSelectedAddressId(prev => prev || preselect.id)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isOpen])

  // Fetch a SetupIntent to save a card once the form opens — the customer's
  // payment method has to be on file before submitting, since charging
  // happens later when the cleaner confirms (they aren't present for that step).
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetch('/api/stripe/setup-intent', { method: 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { clientSecret: string }) => { if (!cancelled) setSetupClientSecret(data.clientSecret) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isOpen])

  function resetAndClose() {
    setBedrooms('1')
    setBathrooms('1')
    setCleaningType('STANDARD')
    setBookingDate('')
    setStartTime('')
    setDurationTouched(false)
    setBookingNotes('')
    setSetupClientSecret(null)
    setBookingError(null)
    onClose()
  }

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!bookingDate || !startTime || !selectedAddress || bookingSubmitting) return
    if (!paymentHandleRef.current) {
      setBookingError(tBooking('paymentNotReady'))
      return
    }

    setBookingSubmitting(true)
    setBookingError(null)
    try {
      const paymentMethodId = await paymentHandleRef.current.confirmCard()

      const res = await fetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introduction_id: introductionId,
          bedrooms:         Number(bedrooms),
          bathrooms:        Number(bathrooms),
          cleaning_type:    cleaningType,
          date:             bookingDate,
          start_time:       startTime,
          duration_hours:   Number(durationHours),
          notes:            bookingNotes.trim() || undefined,
          address:          `${selectedAddress.line1}, ${selectedAddress.area ? selectedAddress.area + ', ' : ''}${selectedAddress.city}`,
          address_lat:      selectedAddress.lat ?? undefined,
          address_lng:      selectedAddress.lng ?? undefined,
          finding_us_notes: selectedAddress.finding_us_notes ?? undefined,
          payment_method_id: paymentMethodId,
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('submitError')))

      const newBooking: Booking = await res.json()
      onBookingCreated({ ...newBooking, photo_urls: [] })
      resetAndClose()
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : tBooking('submitError'))
    } finally {
      setBookingSubmitting(false)
    }
  }

  return (
    <>
    <FullScreenModal isOpen={isOpen} onClose={resetAndClose}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0EDEC] shrink-0">
        <span className="text-[14px] font-medium text-[#0D1F1E]">{tBooking('with', { name: cleanerName })}</span>
        <button
          type="button"
          onClick={resetAndClose}
          aria-label="Close"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] border border-[#E0EDEC] text-[#6B8886] hover:text-[#0D1F1E] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0 ml-2"
        >
          ×
        </button>
      </div>

      <form id="booking-form" onSubmit={handleBookingSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {bookingError && <p className="text-[12px] text-red-600">{bookingError}</p>}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="booking-cleaning-type" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('cleaningType')}</label>
            <select
              id="booking-cleaning-type"
              value={cleaningType}
              onChange={e => setCleaningType(e.target.value as CleaningType)}
              className="input !py-2 text-[13px]"
            >
              <option value="STANDARD">{tBooking('standardClean')}</option>
              <option value="DEEP">{tBooking('deepClean')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="booking-duration" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('duration')}</label>
            <input
              id="booking-duration"
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={durationHours}
              onChange={e => { setDurationHours(e.target.value); setDurationTouched(true) }}
              className="input !py-2 text-[13px]"
              required
            />
          </div>
        </div>
        <p className="text-[11px] text-[#6B8886] -mt-1">{tBooking('durationEstimateHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="booking-bedrooms" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('bedrooms')}</label>
            <input
              id="booking-bedrooms"
              type="number"
              min={0}
              max={10}
              step={1}
              value={bedrooms}
              onChange={e => setBedrooms(e.target.value)}
              className="input !py-2 text-[13px]"
              required
            />
          </div>
          <div>
            <label htmlFor="booking-bathrooms" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('bathrooms')}</label>
            <input
              id="booking-bathrooms"
              type="number"
              min={1}
              max={10}
              step={1}
              value={bathrooms}
              onChange={e => setBathrooms(e.target.value)}
              className="input !py-2 text-[13px]"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="booking-date" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('date')}</label>
            <input
              id="booking-date"
              type="date"
              value={bookingDate}
              min={todayStr}
              onChange={e => setBookingDate(e.target.value)}
              className="input !py-2 text-[13px]"
              required
            />
          </div>
          <div>
            <label htmlFor="booking-start-time" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('startTime')}</label>
            <select
              id="booking-start-time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="input !py-2 text-[13px]"
              required
            >
              <option value="" disabled>{tBooking('selectTime')}</option>
              {TIME_SLOTS.map(slot => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="booking-address" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('address')}</label>
          <select
            id="booking-address"
            value={selectedAddressId}
            onChange={e => {
              if (e.target.value === ADD_NEW_ADDRESS) { setShowAddressModal(true); return }
              setSelectedAddressId(e.target.value)
            }}
            className="input !py-2 text-[13px]"
            required
          >
            <option value="" disabled>{tAddr('selectAddress')}</option>
            {savedAddresses.map(a => {
              const place = a.area ? `${a.area}, ${a.city}` : a.city
              return (
                <option key={a.id} value={a.id}>
                  {a.label ? `${a.label} — ${a.line1}, ${place}` : `${a.line1}, ${place}`}
                </option>
              )
            })}
            <option value={ADD_NEW_ADDRESS}>{tAddr('addNewOption')}</option>
          </select>
          {selectedAddress?.area && (
            <p className="text-[11px] text-[#6B8886] mt-1">{tBooking('outsideCityCentreNudge')}</p>
          )}
        </div>
        <div>
          <label htmlFor="booking-notes" className="block text-[11px] text-[#6B8886] mb-1">{tBooking('notes')}</label>
          <textarea
            id="booking-notes"
            value={bookingNotes}
            onChange={e => setBookingNotes(e.target.value.slice(0, 1000))}
            placeholder={tBooking('notesPlaceholder')}
            rows={2}
            className="input !py-2 text-[13px] resize-none w-full"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('paymentMethod')}</label>
          {setupClientSecret ? (
            <BookingPaymentElement
              clientSecret={setupClientSecret}
              onReady={handle => { paymentHandleRef.current = handle }}
            />
          ) : (
            <p className="text-[12px] text-[#6B8886]">{tBooking('loadingPayment')}</p>
          )}
        </div>
      </form>

      <div className="flex gap-2 px-4 py-3 border-t border-[#E0EDEC] shrink-0">
        <button
          type="submit"
          form="booking-form"
          disabled={bookingSubmitting || !selectedAddress || !setupClientSecret}
          className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
        >
          {tBooking('submit')}
        </button>
        <button
          type="button"
          onClick={resetAndClose}
          className="btn-ghost !px-4 !py-2 text-[13px] rounded-full"
        >
          {tBooking('cancelForm')}
        </button>
      </div>
    </FullScreenModal>

    <AddressFormModal
      isOpen={showAddressModal}
      onClose={() => setShowAddressModal(false)}
      addresses={savedAddresses}
      onSelect={address => {
        setSavedAddresses(prev => prev.some(a => a.id === address.id) ? prev : [...prev, address])
        setSelectedAddressId(address.id)
        setShowAddressModal(false)
      }}
      onDeleted={id => {
        setSavedAddresses(prev => prev.filter(a => a.id !== id))
        setSelectedAddressId(prev => prev === id ? '' : prev)
      }}
    />
    </>
  )
}
