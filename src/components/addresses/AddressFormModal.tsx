'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import FullScreenModal from '@/components/ui/FullScreenModal'
import { CITIES } from '@/lib/cities'
import { extractErrorMessage } from '@/lib/utils'

// Leaflet touches the DOM directly at mount and has no SSR support.
const AddressMapPicker = dynamic(() => import('./AddressMapPicker'), { ssr: false })

export interface SavedAddress {
  id:               string
  label:            string | null
  line1:            string
  city:             string
  area:             string | null
  postal_code:      string | null
  lat:              number | null
  lng:              number | null
  finding_us_notes: string | null
}

interface Props {
  isOpen:     boolean
  onClose:    () => void
  addresses:  SavedAddress[]
  // Called both when an existing address row is picked and when a new one is
  // saved — either way the caller should select it and update its own list.
  // Only used in 'picker' mode.
  onSelect?:  (address: SavedAddress) => void
  onDeleted:  (id: string) => void
  // 'picker' (default): booking flow — clicking a row selects it for the
  // booking. 'manage': Profile tab — clicking a row edits it in place instead.
  mode?:      'picker' | 'manage'
  // Fired on create/update in 'manage' mode so the caller can sync its list.
  onSaved?:   (address: SavedAddress) => void
}

// Manages a customer's saved addresses: pick an existing one, delete one, or
// add a new one in Cyprus format (street+number, city, postal code). Reached
// from the booking form's "+ Add new address" option, and from the Profile
// tab's Addresses section (in 'manage' mode, which also allows editing).
export default function AddressFormModal({ isOpen, onClose, addresses, onSelect, onDeleted, mode = 'picker', onSaved }: Props) {
  const tAddr    = useTranslations('address')
  const tCities  = useTranslations('cities')

  const [label,            setLabel]            = useState('')
  const [line1,            setLine1]            = useState('')
  const [city,             setCity]             = useState('')
  const [area,             setArea]             = useState('')
  const [postalCode,       setPostalCode]       = useState('')
  const [pin,               setPin]             = useState<{ lat: number; lng: number } | null>(null)
  const [findingUsNotes,   setFindingUsNotes]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [panTarget,  setPanTarget]  = useState<[number, number] | null>(null)

  // Geocode the typed area/city (via Nominatim, OSM's free geocoder) so the
  // map pans somewhere useful before the customer drops a pin — debounced to
  // avoid hammering the API on every keystroke. Only pans the view; never
  // moves the pin itself.
  useEffect(() => {
    const query = area.trim() || city
    if (!query || query.length < 3) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${query}, Cyprus`)}&format=json&limit=1`
        )
        if (!res.ok) return
        const results: { lat: string; lon: string }[] = await res.json()
        if (results[0]) setPanTarget([parseFloat(results[0].lat), parseFloat(results[0].lon)])
      } catch {
        // Best-effort navigation hint only — a failed geocode just means the
        // map doesn't pan; it never blocks dropping a pin manually.
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [area, city])

  function resetForm() {
    setLabel('')
    setLine1('')
    setCity('')
    setArea('')
    setPostalCode('')
    setPin(null)
    setFindingUsNotes('')
    setError(null)
    setPanTarget(null)
  }

  useEffect(() => {
    if (!isOpen) return
    resetForm()
    setEditingId(null)
  }, [isOpen])

  function startEdit(a: SavedAddress) {
    setEditingId(a.id)
    setLabel(a.label ?? '')
    setLine1(a.line1)
    setCity(a.city)
    setArea(a.area ?? '')
    setPostalCode(a.postal_code ?? '')
    setPin(a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null)
    setFindingUsNotes(a.finding_us_notes ?? '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    resetForm()
  }

  function formatAddress(a: SavedAddress): string {
    const place = a.area ? `${a.area}, ${a.city}` : a.city
    return a.label ? `${a.label} — ${a.line1}, ${place}` : `${a.line1}, ${place}`
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/addresses/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tAddr('deleteError')))
      onDeleted(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : tAddr('deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!line1.trim() || !city || !pin || saving) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(editingId ? `/api/addresses/${editingId}` : '/api/addresses', {
        method:  editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label:            label.trim() || undefined,
          line1:            line1.trim(),
          city,
          area:             area.trim() || undefined,
          postal_code:      postalCode.trim() || undefined,
          lat:              pin?.lat,
          lng:              pin?.lng,
          finding_us_notes: findingUsNotes.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tAddr('saveError')))

      const saved: SavedAddress = await res.json()
      if (mode === 'manage') {
        onSaved?.(saved)
        cancelEdit()
      } else {
        onSelect?.(saved)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tAddr('saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FullScreenModal isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0EDEC] shrink-0">
        <span className="text-[14px] font-medium text-[#0D1F1E]">{tAddr('yourAddresses')}</span>
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
        {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-3 py-2">{error}</p>}

        {addresses.length > 0 && (
          <div className="space-y-1.5">
            {addresses.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-[#E0EDEC] px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => mode === 'manage' ? startEdit(a) : onSelect?.(a)}
                  className="flex-1 min-w-0 text-left text-[13px] text-[#0D1F1E] hover:text-[#19706A] transition-colors truncate"
                >
                  {formatAddress(a)}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  aria-label={tAddr('deleteAddress')}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-[#6B8886] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 text-[16px] leading-none"
                >
                  {deletingId === a.id ? '…' : '×'}
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-[#E0EDEC]">
          <div className="flex items-center justify-between pt-2">
            <p className="text-[13px] font-medium text-[#0D1F1E]">{editingId ? tAddr('editAddress') : tAddr('addNew')}</p>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="text-[12px] text-[#6B8886] hover:text-[#0D1F1E] transition-colors">
                {tAddr('cancelEdit')}
              </button>
            )}
          </div>
          <div>
            <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('label')}</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value.slice(0, 50))}
              placeholder={tAddr('labelPlaceholder')}
              className="input !py-2 text-[13px] w-full"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('line1')}</label>
            <input
              type="text"
              value={line1}
              onChange={e => setLine1(e.target.value.slice(0, 200))}
              placeholder={tAddr('line1Placeholder')}
              className="input !py-2 text-[13px] w-full"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('city')}</label>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="input !py-2 text-[13px]"
                required
              >
                <option value="" disabled>{tAddr('selectCity')}</option>
                {CITIES.map(c => (
                  <option key={c.value} value={c.value}>{tCities(c.key)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('postalCode')}</label>
              <input
                type="text"
                value={postalCode}
                onChange={e => setPostalCode(e.target.value.slice(0, 10))}
                placeholder={tAddr('postalCodePlaceholder')}
                className="input !py-2 text-[13px] w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('area')}</label>
            <input
              type="text"
              value={area}
              onChange={e => setArea(e.target.value.slice(0, 100))}
              placeholder={tAddr('areaPlaceholder')}
              className="input !py-2 text-[13px] w-full"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('mapPin')}</label>
            <AddressMapPicker
              lat={pin?.lat ?? null}
              lng={pin?.lng ?? null}
              onChange={(lat, lng) => setPin({ lat, lng })}
              panTo={panTarget}
            />
            <p className={`text-[11px] mt-1 ${pin ? 'text-[#19706A]' : 'text-[#B5541F]'}`}>
              {pin ? tAddr('mapPinSet') : tAddr('mapPinHint')}
            </p>
          </div>
          <div>
            <label className="block text-[11px] text-[#6B8886] mb-1">{tAddr('findingUsNotes')}</label>
            <textarea
              value={findingUsNotes}
              onChange={e => setFindingUsNotes(e.target.value.slice(0, 500))}
              placeholder={tAddr('findingUsNotesPlaceholder')}
              rows={2}
              className="input !py-2 text-[13px] w-full resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !line1.trim() || !city || !pin}
            className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
          >
            {saving ? tAddr('saving') : editingId ? tAddr('saveChanges') : tAddr('save')}
          </button>
        </form>
      </div>
    </FullScreenModal>
  )
}
