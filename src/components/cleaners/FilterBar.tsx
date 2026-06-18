'use client'

import { useState, useEffect, useRef } from 'react'
import { MOCK_CLEANERS } from '@/lib/mockCleaners'

export type FilterState = {
  cities: string[]
  maxRate: number
  minRating: number | null
  gender: 'any' | 'female' | 'male'
  languages: string[]
  availability: string[]
  cleanerType: 'any' | 'individual' | 'company'
  verifiedOnly: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  cities: [],
  maxRate: 40,
  minRating: null,
  gender: 'any',
  languages: [],
  availability: [],
  cleanerType: 'any',
  verifiedOnly: false,
}

const ALL_CITIES = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta', 'Paralimni', 'Ayia Napa', 'Kyrenia']
const LANGUAGES = [{ code: 'EN', label: 'English' }, { code: 'EL', label: 'Greek' }, { code: 'RU', label: 'Russian' }]
const AVAIL_OPTIONS = ['weekdays', 'weekends', 'evenings']

const cityCounts = MOCK_CLEANERS.reduce((acc, c) => {
  acc[c.city] = (acc[c.city] || 0) + 1
  return acc
}, {} as Record<string, number>)

function hasActive(f: FilterState) {
  return f.cities.length > 0 || f.maxRate < 40 || f.minRating !== null ||
    f.gender !== 'any' || f.languages.length > 0 || f.availability.length > 0 ||
    f.cleanerType !== 'any' || f.verifiedOnly
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
    >
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Dot() {
  return <span className="w-1.5 h-1.5 rounded-full bg-[#19706A] shrink-0 inline-block" />
}

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const pillBase = "flex items-center gap-1.5 px-3.5 py-[7px] rounded-full border-[1.5px] text-[13px] cursor-pointer whitespace-nowrap transition-all select-none"
const pillOff = "border-[#E0EDEC] text-[#0D1F1E] bg-white hover:border-[#AACBC8]"
const pillOn = "bg-[#E8F4F3] border-[#19706A] text-[#19706A] font-medium"

function Panel({ children, onClick }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="absolute top-full left-0 mt-1.5 bg-white border border-[#E0EDEC] rounded-[12px] p-4 min-w-[210px]"
      style={{ boxShadow: '0 8px 24px rgba(25,112,106,0.10)', zIndex: 200 }}
      onMouseDown={e => e.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

function ApplyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onMouseDown={e => { e.stopPropagation(); onClick() }}
      className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors"
    >
      Apply
    </button>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span
      className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${checked ? 'bg-[#19706A] border-[#19706A]' : 'bg-white border-[#D0DCD9]'}`}
      onMouseDown={e => { e.preventDefault(); onChange() }}
    >
      {checked && <CheckIcon />}
    </span>
  )
}

function Radio({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span
      className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${checked ? 'border-[#19706A]' : 'border-[#D0DCD9]'}`}
      onMouseDown={e => { e.preventDefault(); onChange() }}
    >
      {checked && <span className="w-2 h-2 rounded-full bg-[#19706A] block" />}
    </span>
  )
}

interface Props {
  filters: FilterState
  onChange: (f: FilterState) => void
}

export default function FilterBar({ filters, onChange }: Props) {
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenPanel(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const toggle = (panel: string) => setOpenPanel(prev => prev === panel ? null : panel)
  const update = (partial: Partial<FilterState>) => onChange({ ...filters, ...partial })
  const close = () => setOpenPanel(null)

  // Build active pills for the row below
  type ActivePill = { key: string; label: string; onRemove: () => void }
  const activePills: ActivePill[] = []
  filters.cities.forEach(c => activePills.push({ key: `city-${c}`, label: c, onRemove: () => update({ cities: filters.cities.filter(x => x !== c) }) }))
  if (filters.maxRate < 40) activePills.push({ key: 'price', label: `Up to €${filters.maxRate}/hr`, onRemove: () => update({ maxRate: 40 }) })
  if (filters.minRating !== null) activePills.push({ key: 'rating', label: `${filters.minRating}+`, onRemove: () => update({ minRating: null }) })
  if (filters.gender !== 'any') activePills.push({ key: 'gender', label: filters.gender === 'female' ? 'Female' : 'Male', onRemove: () => update({ gender: 'any' }) })
  filters.languages.forEach(l => activePills.push({ key: `lang-${l}`, label: l, onRemove: () => update({ languages: filters.languages.filter(x => x !== l) }) }))
  filters.availability.forEach(a => activePills.push({ key: `avail-${a}`, label: a.charAt(0).toUpperCase() + a.slice(1), onRemove: () => update({ availability: filters.availability.filter(x => x !== a) }) }))
  if (filters.cleanerType !== 'any') activePills.push({ key: 'type', label: filters.cleanerType === 'individual' ? 'Individual' : 'Company', onRemove: () => update({ cleanerType: 'any' }) })
  if (filters.verifiedOnly) activePills.push({ key: 'verified', label: 'Verified only', onRemove: () => update({ verifiedOnly: false }) })

  return (
    <div ref={containerRef}>
      <div className="sticky top-0 z-[40] bg-white border-b border-[#E0EDEC] px-10">
        <div className="flex items-center gap-2 py-3 overflow-x-auto">

          {/* City */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.cities.length ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('city') }}
            >
              {filters.cities.length > 0 && <Dot />}
              {filters.cities.length === 1 ? filters.cities[0] : 'City'}
              <Chevron open={openPanel === 'city'} />
            </button>
            {openPanel === 'city' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">City</p>
                <div className="space-y-2.5">
                  {ALL_CITIES.map(city => {
                    const count = cityCounts[city] || 0
                    const checked = filters.cities.includes(city)
                    return (
                      <label key={city} className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={checked} onChange={() => update({ cities: checked ? filters.cities.filter(c => c !== city) : [...filters.cities, city] })} />
                        <span className="text-[13px] text-[#0D1F1E] flex-1">{city}</span>
                        <span className="text-[11px] text-[#6B8886]">{count}</span>
                      </label>
                    )
                  })}
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Price */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.maxRate < 40 ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('price') }}
            >
              {filters.maxRate < 40 && <Dot />}
              {filters.maxRate < 40 ? `Up to €${filters.maxRate}` : 'Price'}
              <Chevron open={openPanel === 'price'} />
            </button>
            {openPanel === 'price' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-1">
                  {filters.maxRate < 40 ? `Up to €${filters.maxRate}/hr` : 'Any price'}
                </p>
                <input
                  type="range" min={10} max={40} step={1} value={filters.maxRate}
                  onChange={e => update({ maxRate: parseInt(e.target.value) })}
                  className="w-full mt-3 accent-[#19706A]"
                />
                <div className="flex justify-between text-[11px] text-[#6B8886] mt-1">
                  <span>€10</span><span>€40</span>
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Rating */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.minRating !== null ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('rating') }}
            >
              {filters.minRating !== null && <Dot />}
              {filters.minRating !== null ? `${filters.minRating}+` : 'Rating'}
              <Chevron open={openPanel === 'rating'} />
            </button>
            {openPanel === 'rating' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">Min rating</p>
                <div className="space-y-2.5">
                  {([null, 4.0, 4.5, 4.8] as (number | null)[]).map((val, i) => {
                    const label = val === null ? 'Any rating' : val === 4.8 ? 'Top rated (4.8+)' : `${val}+`
                    const checked = filters.minRating === val
                    return (
                      <label key={i} className="flex items-center gap-2.5 cursor-pointer">
                        <Radio checked={checked} onChange={() => update({ minRating: val })} />
                        <span className="text-[13px] text-[#0D1F1E]">{label}</span>
                      </label>
                    )
                  })}
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Gender */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.gender !== 'any' ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('gender') }}
            >
              {filters.gender !== 'any' && <Dot />}
              {filters.gender !== 'any' ? (filters.gender === 'female' ? 'Female' : 'Male') : 'Gender'}
              <Chevron open={openPanel === 'gender'} />
            </button>
            {openPanel === 'gender' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">Gender</p>
                <div className="space-y-2.5">
                  {(['any', 'female', 'male'] as const).map(g => (
                    <label key={g} className="flex items-center gap-2.5 cursor-pointer">
                      <Radio checked={filters.gender === g} onChange={() => update({ gender: g })} />
                      <span className="text-[13px] text-[#0D1F1E]">{g === 'any' ? 'Any' : g === 'female' ? 'Female' : 'Male'}</span>
                    </label>
                  ))}
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Language */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.languages.length ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('language') }}
            >
              {filters.languages.length > 0 && <Dot />}
              {filters.languages.length === 1
                ? (LANGUAGES.find(l => l.code === filters.languages[0])?.label ?? 'Language')
                : 'Language'}
              <Chevron open={openPanel === 'language'} />
            </button>
            {openPanel === 'language' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">Language</p>
                <div className="space-y-2.5">
                  {LANGUAGES.map(lang => {
                    const checked = filters.languages.includes(lang.code)
                    return (
                      <label key={lang.code} className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={checked} onChange={() => update({ languages: checked ? filters.languages.filter(l => l !== lang.code) : [...filters.languages, lang.code] })} />
                        <span className="text-[13px] text-[#0D1F1E]">{lang.label} ({lang.code})</span>
                      </label>
                    )
                  })}
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Availability */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.availability.length ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('availability') }}
            >
              {filters.availability.length > 0 && <Dot />}
              {filters.availability.length === 1
                ? filters.availability[0].charAt(0).toUpperCase() + filters.availability[0].slice(1)
                : 'Availability'}
              <Chevron open={openPanel === 'availability'} />
            </button>
            {openPanel === 'availability' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">Availability</p>
                <div className="space-y-2.5">
                  {AVAIL_OPTIONS.map(a => {
                    const checked = filters.availability.includes(a)
                    return (
                      <label key={a} className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={checked} onChange={() => update({ availability: checked ? filters.availability.filter(x => x !== a) : [...filters.availability, a] })} />
                        <span className="text-[13px] text-[#0D1F1E]">{a.charAt(0).toUpperCase() + a.slice(1)}</span>
                      </label>
                    )
                  })}
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Type */}
          <div className="relative">
            <button
              className={`${pillBase} ${filters.cleanerType !== 'any' ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('type') }}
            >
              {filters.cleanerType !== 'any' && <Dot />}
              {filters.cleanerType !== 'any' ? (filters.cleanerType === 'individual' ? 'Individual' : 'Company') : 'Type'}
              <Chevron open={openPanel === 'type'} />
            </button>
            {openPanel === 'type' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">Type</p>
                <div className="space-y-2.5">
                  {(['any', 'individual', 'company'] as const).map(t => (
                    <label key={t} className="flex items-center gap-2.5 cursor-pointer">
                      <Radio checked={filters.cleanerType === t} onChange={() => update({ cleanerType: t })} />
                      <span className="text-[13px] text-[#0D1F1E]">{t === 'any' ? 'Any' : t === 'individual' ? 'Individual' : 'Company'}</span>
                    </label>
                  ))}
                </div>
                <ApplyBtn onClick={close} />
              </Panel>
            )}
          </div>

          {/* Verified Only toggle */}
          <button
            className={`${pillBase} ${filters.verifiedOnly ? pillOn : pillOff}`}
            onMouseDown={e => { e.stopPropagation(); update({ verifiedOnly: !filters.verifiedOnly }) }}
          >
            {filters.verifiedOnly && <Dot />}
            Verified only
          </button>

          {/* Divider + Clear all */}
          {hasActive(filters) && (
            <>
              <span className="w-px h-5 bg-[#E0EDEC] mx-1 shrink-0" />
              <button
                className="text-[12px] text-[#6B8886] hover:text-[#19706A] transition-colors whitespace-nowrap"
                onMouseDown={e => { e.stopPropagation(); onChange(DEFAULT_FILTERS); setOpenPanel(null) }}
              >
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active filter pills row */}
      {activePills.length > 0 && (
        <div className="bg-white border-b border-[#E0EDEC] px-10 py-2.5 flex gap-2 flex-wrap">
          {activePills.map(pill => (
            <span key={pill.key} className="flex items-center gap-1.5 bg-[#E8F4F3] text-[#19706A] rounded-full px-3 py-1 text-[12px] font-medium">
              {pill.label}
              <button
                className="leading-none hover:text-[#0D5752] ml-0.5 text-[14px]"
                onClick={pill.onRemove}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
