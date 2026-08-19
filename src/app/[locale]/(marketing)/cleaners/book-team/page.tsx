'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { extractErrorMessage, estimateCleaningHours } from '@/lib/utils'
import { isCleanerAvailableAt, type WeeklyAvailability } from '@/lib/availability'
import { TIER_CODES } from '@/lib/serviceOfferings'
import AddressFormModal, { type SavedAddress } from '@/components/addresses/AddressFormModal'
import BookingPaymentElement, { type BookingPaymentHandle } from '@/components/chat/BookingPaymentElement'
import type { CleaningType } from '@/types'

interface TeamCleaner {
  id: string
  slug: string
  display_name: string
  photo_url: string | null
  hourly_rate_eur: number
  availability: WeeklyAvailability | null
  cleaner_service_offerings: { code: string; price_eur: number }[]
  booking_fee_eur: number
}

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = []
  for (let minutes = 7 * 60; minutes <= 20 * 60; minutes += 15) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0')
    const m = String(minutes % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
  }
  return slots
})()

function tierRateFor(cleaner: TeamCleaner, tier: CleaningType): number {
  if (tier === 'STANDARD') return cleaner.hourly_rate_eur
  return cleaner.cleaner_service_offerings.find(o => o.code === tier)?.price_eur ?? 0
}

function tierLabel(t: (key: string) => string, code: string): string {
  if (code === 'DEEP') return t('deepClean')
  if (code === 'MOVE_IN_OUT') return t('moveInOutClean')
  return t('standardClean')
}

export default function BookTeamPage() {
  const t       = useTranslations('bookTeam')
  const tBooking = useTranslations('booking')
  const tAddr    = useTranslations('address')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status: sessionStatus } = useSession()

  const slugs = useMemo(() => (searchParams.get('slugs') ?? '').split(',').filter(Boolean), [searchParams])

  const [cleaners,       setCleaners]       = useState<TeamCleaner[]>([])
  const [loadingCleaners, setLoadingCleaners] = useState(true)
  const [loadError,      setLoadError]      = useState<string | null>(null)

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

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedAddress = savedAddresses.find(a => a.id === selectedAddressId) ?? null
  const todayStr = new Date().toISOString().slice(0, 10)

  // Redirect anyone who isn't a logged-in customer back through login,
  // preserving the selected cleaners so they land right back here after.
  useEffect(() => {
    if (sessionStatus === 'loading') return
    const role = (session?.user as { role?: string } | undefined)?.role
    if (!session || role !== 'CUSTOMER') {
      const returnTo = `/cleaners/book-team?${searchParams.toString()}`
      router.push(`/login?return=${encodeURIComponent(returnTo)}`)
    }
  }, [session, sessionStatus, searchParams, router])

  useEffect(() => {
    if (slugs.length === 0) { setLoadingCleaners(false); return }
    let cancelled = false
    Promise.all(
      slugs.map(slug =>
        fetch(`/api/cleaners/${slug}`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ).then(rows => {
      if (cancelled) return
      const valid = rows.filter((r): r is TeamCleaner => !!r)
      setCleaners(valid)
      setLoadingCleaners(false)
    })
    return () => { cancelled = true }
  }, [slugs])

  useEffect(() => {
    fetch('/api/addresses')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: SavedAddress[]) => {
        setSavedAddresses(data)
        const preselect = data.length === 1 ? data[0] : data.find(a => a.is_default)
        if (preselect) setSelectedAddressId(prev => prev || preselect.id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/stripe/setup-intent', { method: 'POST' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { clientSecret: string }) => setSetupClientSecret(data.clientSecret))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (durationTouched) return
    setDurationHours(String(estimateCleaningHours(Number(bedrooms) || 0, Number(bathrooms) || 0, cleaningType)))
  }, [bedrooms, bathrooms, cleaningType, durationTouched])

  // Only offer a tier if EVERY selected cleaner has priced it — the job is
  // one shared tier/duration across the whole team, so a tier only one of
  // them offers can't be resolved into a total.
  const availableTierCodes = useMemo(
    () => TIER_CODES.filter(code => cleaners.length > 0 && cleaners.every(c => c.cleaner_service_offerings.some(o => o.code === code))),
    [cleaners]
  )

  // Reset off an tier that stopped being valid (e.g. cleaners still loading)
  useEffect(() => {
    if (cleaningType !== 'STANDARD' && !availableTierCodes.includes(cleaningType as 'DEEP' | 'MOVE_IN_OUT')) {
      setCleaningType('STANDARD')
    }
  }, [availableTierCodes, cleaningType])

  const unavailableCleaners = useMemo(() => {
    if (!bookingDate || !startTime) return []
    const hours = Number(durationHours) || 0
    return cleaners.filter(c => !isCleanerAvailableAt(c.availability, bookingDate, startTime, hours))
  }, [cleaners, bookingDate, startTime, durationHours])

  const hours = Number(durationHours) || 0
  const cleanerTotal = cleaners.reduce((sum, c) => sum + tierRateFor(c, cleaningType) * hours, 0)
  const feeTotal = cleaners.reduce((sum, c) => sum + c.booking_fee_eur, 0)
  const grandTotal = Math.round((cleanerTotal + feeTotal) * 100) / 100

  const canSubmit = cleaners.length >= 2
    && bookingDate && startTime && selectedAddress
    && unavailableCleaners.length === 0
    && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !paymentHandleRef.current || !selectedAddress) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const paymentMethodId = await paymentHandleRef.current.confirmCard()

      const res = await fetch('/api/bookings/multi', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleaner_profile_ids: cleaners.map(c => c.id),
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
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('submitError')))

      const newBooking: { id: string } = await res.json()
      router.push(`/dashboard?booking=${newBooking.id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionStatus === 'loading' || loadingCleaners) {
    return (
      <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
        <div className="max-w-[700px] mx-auto space-y-3">
          <div className="h-4 w-40 bg-[#E0EDEC] dark:bg-[#253634] rounded animate-pulse" />
          <div className="card p-8 h-[500px] animate-pulse" />
        </div>
      </div>
    )
  }

  if (cleaners.length < 2) {
    return (
      <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
        <div className="max-w-[700px] mx-auto card p-8 text-center">
          <p className="text-[15px] text-[#0D1F1E] dark:text-[#ECF3F2] font-medium mb-2">{t('needTwoCleaners')}</p>
          <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-5">{t('needTwoCleanersSub')}</p>
          <Link href="/cleaners" className="btn-primary rounded-full px-5 py-2 text-[13px] inline-block">{t('backToDirectory')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
      <div className="max-w-[700px] mx-auto">
        <div className="mb-5">
          <Link href="/cleaners" className="text-[13px] text-[#19706A] hover:underline">{t('backToDirectory')}</Link>
        </div>

        <div className="card p-8">
          <h1 className="text-[22px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1">{t('heading')}</h1>
          <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-6">{t('subheading', { count: cleaners.length })}</p>

          {/* Selected cleaners */}
          <div className="space-y-2 mb-6">
            {cleaners.map(c => {
              const unavailable = unavailableCleaners.some(u => u.id === c.id)
              return (
                <div key={c.id} className="flex items-center gap-3 border border-[#E0EDEC] dark:border-[#253634] rounded-[10px] p-2.5">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#E8F4F3] dark:bg-[#17302D] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">{c.display_name}</p>
                    <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">€{tierRateFor(c, cleaningType).toFixed(2)}/hr</p>
                  </div>
                  {unavailable && (
                    <span className="text-[11px] text-red-600 shrink-0">{t('notAvailable')}</span>
                  )}
                </div>
              )
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {submitError && <p className="text-[12px] text-red-600">{submitError}</p>}

            <div>
              <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('cleaningType')}</p>
              <div role="radiogroup" aria-label={tBooking('cleaningType')} className="flex flex-wrap gap-2">
                {(['STANDARD', ...availableTierCodes] as CleaningType[]).map(code => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCleaningType(code)}
                    className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors ${
                      cleaningType === code
                        ? 'bg-[#19706A] border-[#19706A] text-white'
                        : 'bg-white dark:bg-[#16211F] border-[#E0EDEC] dark:border-[#253634] text-[#0D1F1E] dark:text-[#ECF3F2] hover:border-[#19706A]'
                    }`}
                  >
                    {tierLabel(tBooking, code)}
                  </button>
                ))}
              </div>
              {availableTierCodes.length < TIER_CODES.length && (
                <p className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mt-1">{t('tierIntersectionHint')}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="team-bedrooms" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('bedrooms')}</label>
                <input id="team-bedrooms" type="number" min={0} max={10} step={1} value={bedrooms} onChange={e => setBedrooms(e.target.value)} className="input !py-2 text-[13px]" required />
              </div>
              <div>
                <label htmlFor="team-bathrooms" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('bathrooms')}</label>
                <input id="team-bathrooms" type="number" min={1} max={10} step={1} value={bathrooms} onChange={e => setBathrooms(e.target.value)} className="input !py-2 text-[13px]" required />
              </div>
            </div>

            <div>
              <label htmlFor="team-duration" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('duration')}</label>
              <input
                id="team-duration"
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
                <label htmlFor="team-date" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('date')}</label>
                <input id="team-date" type="date" value={bookingDate} min={todayStr} onChange={e => setBookingDate(e.target.value)} className="input !py-2 text-[13px]" required />
              </div>
              <div>
                <label htmlFor="team-start-time" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('startTime')}</label>
                <select id="team-start-time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input !py-2 text-[13px]" required>
                  <option value="" disabled>{tBooking('selectTime')}</option>
                  {TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                </select>
              </div>
            </div>

            {unavailableCleaners.length > 0 && (
              <p className="text-[12px] text-red-600">{t('unavailableWarning', { count: unavailableCleaners.length })}</p>
            )}

            <div>
              <label htmlFor="team-address" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('address')}</label>
              <select
                id="team-address"
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
                  return <option key={a.id} value={a.id}>{a.label ? `${a.label} — ${a.line1}, ${place}` : `${a.line1}, ${place}`}</option>
                })}
                <option value={ADD_NEW_ADDRESS}>{tAddr('addNewOption')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="team-notes" className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('notes')}</label>
              <textarea id="team-notes" value={bookingNotes} onChange={e => setBookingNotes(e.target.value.slice(0, 1000))} placeholder={tBooking('notesPlaceholder')} rows={2} className="input !py-2 text-[13px] resize-none w-full" />
            </div>

            <div className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] bg-[#F7FAF9] dark:bg-[#0F1817] rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-[#5B7472] dark:text-[#9BB0AE]">
                <span>{t('cleanersRateLine')}</span>
                <span>€{cleanerTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#5B7472] dark:text-[#9BB0AE]">
                <span>{t('bookingFeesLine', { count: cleaners.length })}</span>
                <span>€{feeTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{tBooking('totalLine')}</span>
                <span>€{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mb-1">{tBooking('paymentMethod')}</label>
              {setupClientSecret ? (
                <BookingPaymentElement clientSecret={setupClientSecret} onReady={handle => { paymentHandleRef.current = handle }} />
              ) : (
                <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('loadingPayment')}</p>
              )}
            </div>

            <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50">
              {submitting ? tBooking('submit') : t('submit', { count: cleaners.length })}
            </button>
          </form>
        </div>
      </div>

      <AddressFormModal
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        addresses={savedAddresses}
        onSelect={address => {
          setSavedAddresses(prev => (prev.some(a => a.id === address.id) ? prev : [...prev, address]))
          setSelectedAddressId(address.id)
          setShowAddressModal(false)
        }}
        onDeleted={id => {
          setSavedAddresses(prev => prev.filter(a => a.id !== id))
          setSelectedAddressId(prev => (prev === id ? '' : prev))
        }}
      />
    </div>
  )
}
