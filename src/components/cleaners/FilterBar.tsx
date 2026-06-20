'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { MOCK_CLEANERS } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'

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

const ALL_CITIES = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta', 'Paralimni', 'Ayia Napa', 'Protaras']
const LANGUAGES = [{ code: 'EN', label: 'English' }, { code: 'EL', label: 'Greek' }, { code: 'RU', label: 'Russian' }]
const AVAIL_KEYS = ['weekdays', 'weekends', 'evenings'] as const

const cityCounts = MOCK_CLEANERS.reduce((acc, c) => {
  c.cities.forEach(city => { acc[city] = (acc[city] || 0) + 1 })
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
const pillOn  = "bg-[#E8F4F3] border-[#19706A] text-[#19706A] font-medium"

function Panel({ children, onMouseDown }: { children: React.ReactNode; onMouseDown?: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="absolute top-full left-0 mt-1.5 bg-white border border-[#E0EDEC] rounded-[12px] p-4 min-w-[210px]"
      style={{ boxShadow: '0 8px 24px rgba(25,112,106,0.10)', zIndex: 200 }}
      onMouseDown={onMouseDown ?? (e => e.stopPropagation())}
    >
      {children}
    </div>
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
  const t  = useTranslations('filters')
  const getCityName = useCity()
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
  const close  = () => setOpenPanel(null)

  // Helpers for translated labels
  const availLabel = (a: string) => t(a as 'weekdays' | 'weekends' | 'evenings')
  const ratingLabel = (val: number | null) => {
    if (val === null) return t('anyRating')
    if (val === 4.0)  return t('rating40')
    if (val === 4.5)  return t('rating45')
    return t('rating48')
  }

  // Active pills
  type Pill = { key: string; label: string; onRemove: () => void }
  const activePills: Pill[] = []
  filters.cities.forEach(c => activePills.push({ key: `city-${c}`, label: getCityName(c), onRemove: () => update({ cities: filters.cities.filter(x => x !== c) }) }))
  if (filters.maxRate < 40) activePills.push({ key: 'price', label: t('upTo', { value: filters.maxRate }), onRemove: () => update({ maxRate: 40 }) })
  if (filters.minRating !== null) activePills.push({ key: 'rating', label: `${filters.minRating}+`, onRemove: () => update({ minRating: null }) })
  if (filters.gender !== 'any') activePills.push({ key: 'gender', label: filters.gender === 'female' ? t('female') : t('male'), onRemove: () => update({ gender: 'any' }) })
  filters.languages.forEach(l => activePills.push({ key: `lang-${l}`, label: l, onRemove: () => update({ languages: filters.languages.filter(x => x !== l) }) }))
  filters.availability.forEach(a => activePills.push({ key: `avail-${a}`, label: availLabel(a), onRemove: () => update({ availability: filters.availability.filter(x => x !== a) }) }))
  if (filters.cleanerType !== 'any') activePills.push({ key: 'type', label: filters.cleanerType === 'individual' ? t('individual') : t('company'), onRemove: () => update({ cleanerType: 'any' }) })
  if (filters.verifiedOnly) activePills.push({ key: 'verified', label: t('verifiedOnly'), onRemove: () => update({ verifiedOnly: false }) })

  return (
    <div ref={containerRef}>
      {/*
        sticky top-16: sits just below the navbar (h-16 = 64px)
        z-[60]: above navbar z-50, so dropdowns (z-200 within this context) also render above navbar
        NO overflow property — overflow on this element would clip the dropdown panels
      */}
      <div className="sticky top-16 z-[60] bg-white border-b border-[#E0EDEC]">
        {/*
          Pills row: NO overflow-x-auto here — overflow-x:auto creates a new overflow context
          that clips absolute-positioned children (the dropdown panels) in all major browsers.
          Horizontal scroll on touch is handled natively; on desktop all pills fit at lg+.
        */}
        <div className="flex items-center gap-2 px-10 py-3 flex-wrap lg:flex-nowrap">

          {/* City */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.cities.length ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('city') }}
            >
              {filters.cities.length > 0 && <Dot />}
              {filters.cities.length === 1 ? getCityName(filters.cities[0]) : t('city')}
              <Chevron open={openPanel === 'city'} />
            </button>
            {openPanel === 'city' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">{t('city')}</p>
                <div className="space-y-2.5">
                  {ALL_CITIES.map(city => {
                    const count = cityCounts[city] || 0
                    const checked = filters.cities.includes(city)
                    return (
                      <label key={city} className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={checked} onChange={() => update({ cities: checked ? filters.cities.filter(c => c !== city) : [...filters.cities, city] })} />
                        <span className="text-[13px] text-[#0D1F1E] flex-1">{getCityName(city)}</span>
                        <span className="text-[11px] text-[#6B8886]">{count}</span>
                      </label>
                    )
                  })}
                </div>
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Price */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.maxRate < 40 ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('price') }}
            >
              {filters.maxRate < 40 && <Dot />}
              {filters.maxRate < 40 ? t('upTo', { value: filters.maxRate }) : t('price')}
              <Chevron open={openPanel === 'price'} />
            </button>
            {openPanel === 'price' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-1">
                  {filters.maxRate < 40 ? t('upTo', { value: filters.maxRate }) : t('anyPrice')}
                </p>
                <input
                  type="range" min={10} max={40} step={1} value={filters.maxRate}
                  onChange={e => update({ maxRate: parseInt(e.target.value) })}
                  className="w-full mt-3 accent-[#19706A]"
                />
                <div className="flex justify-between text-[11px] text-[#6B8886] mt-1">
                  <span>€10</span><span>€40</span>
                </div>
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Rating */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.minRating !== null ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('rating') }}
            >
              {filters.minRating !== null && <Dot />}
              {filters.minRating !== null ? `${filters.minRating}+` : t('rating')}
              <Chevron open={openPanel === 'rating'} />
            </button>
            {openPanel === 'rating' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">{t('rating')}</p>
                <div className="space-y-2.5">
                  {([null, 4.0, 4.5, 4.8] as (number | null)[]).map((val, i) => (
                    <label key={i} className="flex items-center gap-2.5 cursor-pointer">
                      <Radio checked={filters.minRating === val} onChange={() => update({ minRating: val })} />
                      <span className="text-[13px] text-[#0D1F1E]">{ratingLabel(val)}</span>
                    </label>
                  ))}
                </div>
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Gender */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.gender !== 'any' ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('gender') }}
            >
              {filters.gender !== 'any' && <Dot />}
              {filters.gender !== 'any' ? (filters.gender === 'female' ? t('female') : t('male')) : t('gender')}
              <Chevron open={openPanel === 'gender'} />
            </button>
            {openPanel === 'gender' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">{t('gender')}</p>
                <div className="space-y-2.5">
                  {(['any', 'female', 'male'] as const).map(g => (
                    <label key={g} className="flex items-center gap-2.5 cursor-pointer">
                      <Radio checked={filters.gender === g} onChange={() => update({ gender: g })} />
                      <span className="text-[13px] text-[#0D1F1E]">{g === 'any' ? t('anyGender') : g === 'female' ? t('female') : t('male')}</span>
                    </label>
                  ))}
                </div>
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Language */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.languages.length ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('language') }}
            >
              {filters.languages.length > 0 && <Dot />}
              {filters.languages.length === 1
                ? (LANGUAGES.find(l => l.code === filters.languages[0])?.label ?? t('language'))
                : t('language')}
              <Chevron open={openPanel === 'language'} />
            </button>
            {openPanel === 'language' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">{t('language')}</p>
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
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Availability */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.availability.length ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('availability') }}
            >
              {filters.availability.length > 0 && <Dot />}
              {filters.availability.length === 1 ? availLabel(filters.availability[0]) : t('availability')}
              <Chevron open={openPanel === 'availability'} />
            </button>
            {openPanel === 'availability' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">{t('availability')}</p>
                <div className="space-y-2.5">
                  {AVAIL_KEYS.map(a => {
                    const checked = filters.availability.includes(a)
                    return (
                      <label key={a} className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={checked} onChange={() => update({ availability: checked ? filters.availability.filter(x => x !== a) : [...filters.availability, a] })} />
                        <span className="text-[13px] text-[#0D1F1E]">{t(a)}</span>
                      </label>
                    )
                  })}
                </div>
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Type */}
          <div className="relative flex-shrink-0">
            <button
              className={`${pillBase} ${filters.cleanerType !== 'any' ? pillOn : pillOff}`}
              onMouseDown={e => { e.stopPropagation(); toggle('type') }}
            >
              {filters.cleanerType !== 'any' && <Dot />}
              {filters.cleanerType !== 'any' ? (filters.cleanerType === 'individual' ? t('individual') : t('company')) : t('type')}
              <Chevron open={openPanel === 'type'} />
            </button>
            {openPanel === 'type' && (
              <Panel>
                <p className="text-[11px] font-medium text-[#6B8886] uppercase tracking-wide mb-3">{t('type')}</p>
                <div className="space-y-2.5">
                  {(['any', 'individual', 'company'] as const).map(tp => (
                    <label key={tp} className="flex items-center gap-2.5 cursor-pointer">
                      <Radio checked={filters.cleanerType === tp} onChange={() => update({ cleanerType: tp })} />
                      <span className="text-[13px] text-[#0D1F1E]">{tp === 'any' ? t('anyType') : tp === 'individual' ? t('individual') : t('company')}</span>
                    </label>
                  ))}
                </div>
                <button onMouseDown={e => { e.stopPropagation(); close() }} className="mt-3 w-full bg-[#19706A] text-white rounded-full px-4 py-1.5 text-[12px] font-medium hover:bg-[#0D5752] transition-colors">{t('apply')}</button>
              </Panel>
            )}
          </div>

          {/* Verified Only toggle */}
          <button
            className={`${pillBase} flex-shrink-0 ${filters.verifiedOnly ? pillOn : pillOff}`}
            onMouseDown={e => { e.stopPropagation(); update({ verifiedOnly: !filters.verifiedOnly }) }}
          >
            {filters.verifiedOnly && <Dot />}
            {t('verifiedOnly')}
          </button>

          {/* Divider + Clear all */}
          {hasActive(filters) && (
            <>
              <span className="w-px h-5 bg-[#E0EDEC] mx-1 shrink-0" />
              <button
                className="text-[12px] text-[#6B8886] hover:text-[#19706A] transition-colors whitespace-nowrap flex-shrink-0"
                onMouseDown={e => { e.stopPropagation(); onChange(DEFAULT_FILTERS); setOpenPanel(null) }}
              >
                {t('clearAll')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active filter pills row — overflow-x-auto is safe here (no absolute children) */}
      {activePills.length > 0 && (
        <div className="bg-white border-b border-[#E0EDEC] px-10 py-2.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          {activePills.map(pill => (
            <span key={pill.key} className="flex-shrink-0 flex items-center gap-1.5 bg-[#E8F4F3] text-[#19706A] rounded-full px-3 py-1 text-[12px] font-medium">
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
