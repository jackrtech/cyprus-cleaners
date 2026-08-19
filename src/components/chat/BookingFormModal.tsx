'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { extractErrorMessage, estimateCleaningHours } from '@/lib/utils'
import FullScreenModal from '@/components/ui/FullScreenModal'
import AddressFormModal, { type SavedAddress } from '@/components/addresses/AddressFormModal'
import BookingPaymentElement, { type BookingPaymentHandle } from '@/components/chat/BookingPaymentElement'
import type { BookingStatus, CleaningType } from '@/types'
import { isTierCode, isAddonCode } from '@/lib/serviceOfferings'

// Same accessible checkbox/radio-pill pattern as FilterBar's Checkbox/Radio
// (src/components/cleaners/FilterBar.tsx) — duplicated locally rather than
// shared, since it's two small stateless indicator components with no state
// of their own.
function toggleKeyHandler(onChange: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onChange()
    }
  }
}

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <span
      role="radio"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${checked ? 'border-[#19706A]' : 'border-[#D0DCD9] dark:border-[#2A3A38]'}`}
      onMouseDown={e => { e.preventDefault(); onChange() }}
      onKeyDown={toggleKeyHandler(onChange)}
    >
      {checked && <span className="w-2 h-2 rounded-full bg-[#19706A] block" />}
    </span>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${checked ? 'bg-[#19706A] border-[#19706A]' : 'bg-white dark:bg-[#16211F] border-[#D0DCD9] dark:border-[#2A3A38]'}`}
      onMouseDown={e => { e.preventDefault(); onChange() }}
      onKeyDown={toggleKeyHandler(onChange)}
    >
      {checked && <CheckIcon />}
    </span>
  )
}

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
  // Optional — only meaningful for a CUSTOMER-opened form. When both are
  // present, a live price breakdown renders above the payment section.
  // This is a display-only estimate: the actual charge is computed
  // server-side by POST /api/bookings at submission (this REQUEST step, not
  // CONFIRM — the cleaner's later CONFIRM charges whatever was locked in
  // here, unchanged) and is never trusted from anything the client sends.
  hourlyRateEur?:    number | null
  bookingFeeEur?:    number | null
  // The cleaner's opt-in tiers (DEEP/MOVE_IN_OUT) and add-ons (CARPET/OVEN)
  // — STANDARD is always available via hourlyRateEur and never appears here.
  offerings?:        { code: string; price_eur: number }[] | null
  onBookingCreated:  (booking: Booking) => void
}

// Its own full-screen modal, separate from the chat thread — the booking
// form has enough fields (room count, duration, date/time, address+map,
// payment) that sharing space with the chat header made it feel cramped
// and secondary. Opened from ChatPanel's "Book"/"Book again" CTA.
export default function BookingFormModal({ isOpen, onClose, introductionId, cleanerName, hourlyRateEur, bookingFeeEur, offerings, onBookingCreated }: Props) {
  const tBooking = useTranslations('booking')
  const tAddr    = useTranslations('address')

  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingError,      setBookingError]      = useState<string | null>(null)

  const [bedrooms,        setBedrooms]        = useState('1')
  const [bathrooms,       setBathrooms]       = useState('1')
  const [cleaningType,    setCleaningType]    = useState<CleaningType>('STANDARD')
  const [addonCodes,      setAddonCodes]      = useState<string[]>([])
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

  const tierOfferings  = (offerings ?? []).filter(o => isTierCode(o.code))
  const addonOfferings = (offerings ?? []).filter(o => isAddonCode(o.code))

  function tierLabel(code: string): string {
    if (code === 'DEEP') return tBooking('deepClean')
    if (code === 'MOVE_IN_OUT') return tBooking('moveInOutClean')
    return tBooking('standardClean')
  }
  function addonLabel(code: string): string {
    if (code === 'CARPET') return tBooking('addonCarpet')
    if (code === 'OVEN') return tBooking('addonOven')
    return code
  }
  // The rate that will actually be charged for the currently-selected tier —
  // hourlyRateEur for STANDARD, otherwise the matching offering's price.
  // Mirrors what POST /api/bookings resolves server-side.
  const selectedTierRateEur = cleaningType === 'STANDARD'
    ? hourlyRateEur ?? null
    : tierOfferings.find(o => o.code === cleaningType)?.price_eur ?? null

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
    setAddonCodes([])
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
          addon_codes:      addonCodes,
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0EDEC] dark:border-[#253634] shrink-0">
        <span className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{tBooking('with', { name: cleanerName })}</span>
        <button
          type="button"
          onClick={resetAndClose}
          aria-label="Close"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0 ml-2"
        >
          ×
        </button>
      </div>

      <form id="booking-form" onSubmit={handleBookingSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {bookingError && <p className="text-[12px] text-red-600">{bookingError}</p>}

        <div>
          <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('cleaningType')}</p>
          <div role="radiogroup" aria-label={tBooking('cleaningType')} className="space-y-1.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Radio checked={cleaningType === 'STANDARD'} onChange={() => setCleaningType('STANDARD')} label={tBooking('standardClean')} />
              <span className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tBooking('standardClean')}</span>
              {hourlyRateEur != null && <span className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">€{hourlyRateEur.toFixed(2)}/hr</span>}
            </label>
            {tierOfferings.map(o => (
              <label key={o.code} className="flex items-center gap-2.5 cursor-pointer">
                <Radio checked={cleaningType === o.code} onChange={() => setCleaningType(o.code as CleaningType)} label={tierLabel(o.code)} />
                <span className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tierLabel(o.code)}</span>
                <span className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">€{o.price_eur.toFixed(2)}/hr</span>
              </label>
            ))}
          </div>
        </div>
        {addonOfferings.length > 0 && (
          <div>
            <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('addonsLabel')}</p>
            <div className="space-y-1.5">
              {addonOfferings.map(o => {
                const checked = addonCodes.includes(o.code)
                const toggle = () => setAddonCodes(prev => checked ? prev.filter(c => c !== o.code) : [...prev, o.code])
                return (
                  <label key={o.code} className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox checked={checked} onChange={toggle} label={addonLabel(o.code)} />
                    <span className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{addonLabel(o.code)}</span>
                    <span className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">+€{o.price_eur.toFixed(2)}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="booking-duration" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('duration')}</label>
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
          <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mt-1">{tBooking('durationEstimateHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="booking-bedrooms" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('bedrooms')}</label>
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
            <label htmlFor="booking-bathrooms" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('bathrooms')}</label>
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
            <label htmlFor="booking-date" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('date')}</label>
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
            <label htmlFor="booking-start-time" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('startTime')}</label>
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
          <label htmlFor="booking-address" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('address')}</label>
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
            <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mt-1">{tBooking('outsideCityCentreNudge')}</p>
          )}
        </div>
        <div>
          <label htmlFor="booking-notes" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('notes')}</label>
          <textarea
            id="booking-notes"
            value={bookingNotes}
            onChange={e => setBookingNotes(e.target.value.slice(0, 1000))}
            placeholder={tBooking('notesPlaceholder')}
            rows={2}
            className="input !py-2 text-[13px] resize-none w-full"
          />
        </div>
        {selectedTierRateEur != null && bookingFeeEur != null && (() => {
          const hours      = Number(durationHours) || 0
          const rate       = Math.round(selectedTierRateEur * hours * 100) / 100
          const addonTotal = Math.round(
            addonCodes.reduce((sum, code) => sum + (addonOfferings.find(o => o.code === code)?.price_eur ?? 0), 0) * 100
          ) / 100
          const total = Math.round((rate + addonTotal + bookingFeeEur) * 100) / 100
          return (
            <div className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-[#5B7472] dark:text-[#9BB0AE]">
                <span>{tBooking('cleanerRateLine')}</span>
                <span>€{rate.toFixed(2)}</span>
              </div>
              {addonTotal > 0 && (
                <div className="flex justify-between text-[#5B7472] dark:text-[#9BB0AE]">
                  <span>{tBooking('addonsLine')}</span>
                  <span>€{addonTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#5B7472] dark:text-[#9BB0AE]">
                <span>{tBooking('bookingFeeLine')}</span>
                <span>€{bookingFeeEur.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{tBooking('totalLine')}</span>
                <span>€{total.toFixed(2)}</span>
              </div>
            </div>
          )
        })()}

        <div>
          <label className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('paymentMethod')}</label>
          {setupClientSecret ? (
            <BookingPaymentElement
              clientSecret={setupClientSecret}
              onReady={handle => { paymentHandleRef.current = handle }}
            />
          ) : (
            <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('loadingPayment')}</p>
          )}
        </div>
      </form>

      <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] px-4 pt-2">
        {tBooking.rich('cancellationPolicyNote', {
          link: chunks => <Link href="/terms#cancellation" className="text-[#19706A] hover:underline font-medium">{chunks}</Link>,
        })}
      </p>

      <div className="flex gap-2 px-4 py-3 border-t border-[#E0EDEC] dark:border-[#253634] shrink-0">
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
