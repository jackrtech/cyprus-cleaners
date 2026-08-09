'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import FullScreenModal from '@/components/ui/FullScreenModal'
import { CITIES } from '@/lib/cities'
import { extractErrorMessage } from '@/lib/utils'

export interface SavedAddress {
  id:          string
  label:       string | null
  line1:       string
  city:        string
  postal_code: string | null
}

interface Props {
  isOpen:     boolean
  onClose:    () => void
  addresses:  SavedAddress[]
  // Called both when an existing address row is picked and when a new one is
  // saved — either way the caller should select it and update its own list.
  onSelect:   (address: SavedAddress) => void
  onDeleted:  (id: string) => void
}

// Manages a customer's saved addresses: pick an existing one, delete one, or
// add a new one in Cyprus format (street+number, city, postal code). Reached
// from the booking form's "+ Add new address" option.
export default function AddressFormModal({ isOpen, onClose, addresses, onSelect, onDeleted }: Props) {
  const tAddr    = useTranslations('address')
  const tCities  = useTranslations('cities')

  const [label,      setLabel]      = useState('')
  const [line1,      setLine1]      = useState('')
  const [city,       setCity]       = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLabel('')
    setLine1('')
    setCity('')
    setPostalCode('')
    setError(null)
  }, [isOpen])

  function formatAddress(a: SavedAddress): string {
    return a.label ? `${a.label} — ${a.line1}, ${a.city}` : `${a.line1}, ${a.city}`
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
    if (!line1.trim() || !city || saving) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/addresses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label:       label.trim() || undefined,
          line1:       line1.trim(),
          city,
          postal_code: postalCode.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tAddr('saveError')))

      const newAddress: SavedAddress = await res.json()
      onSelect(newAddress)
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
                  onClick={() => onSelect(a)}
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
          <p className="text-[13px] font-medium text-[#0D1F1E] pt-2">{tAddr('addNew')}</p>
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
          <button
            type="submit"
            disabled={saving || !line1.trim() || !city}
            className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
          >
            {saving ? tAddr('saving') : tAddr('save')}
          </button>
        </form>
      </div>
    </FullScreenModal>
  )
}
