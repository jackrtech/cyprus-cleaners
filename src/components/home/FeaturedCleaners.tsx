'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'
import CleanerCard from '@/components/cleaners/CleanerCard'

interface DbCleanerRow {
  id:                    string
  slug:                  string
  display_name:          string
  bio:                   string | null
  photo_url:             string | null
  city:                  string | null
  cities:                string[] | null
  hourly_rate_eur:       number
  services:              ('HOUSE' | 'APARTMENT')[] | null
  languages:             string[] | null
  cleaner_type:          'individual' | 'company' | null
  gender:                'female' | 'male' | null
  verified:              boolean
  avg_rating:            number
  review_count:          number
  unique_customer_count: number
  total_jobs_count:      number
  availability:          Record<string, boolean> | null
  is_mock:               boolean
  is_company:            boolean
}

const AVATAR_PALETTE = [
  { bg: '#E8F4F3', text: '#19706A' },
  { bg: '#E6F1FF', text: '#185FA5' },
  { bg: '#EAF3DE', text: '#3B6D11' },
  { bg: '#FAECE7', text: '#712B13' },
  { bg: '#EEEDFE', text: '#3C3489' },
  { bg: '#FBEAF0', text: '#72243E' },
  { bg: '#FDF8E1', text: '#BA7517' },
]

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  return hash
}

function mapAvailability(raw: Record<string, boolean> | null): ('weekdays' | 'weekends' | 'evenings')[] {
  if (!raw) return []
  return (['weekdays', 'weekends', 'evenings'] as const).filter(key => raw[key])
}

function mapCleaner(row: DbCleanerRow): MockCleaner {
  const palette      = AVATAR_PALETTE[hashString(row.id) % AVATAR_PALETTE.length]
  const cleanerType  = row.cleaner_type ?? (row.is_company ? 'company' : 'individual')
  const gender       = cleanerType === 'company' ? null : row.gender

  return {
    id:                     row.id,
    slug:                   row.slug,
    display_name:           row.display_name,
    cities:                 row.cities ?? (row.city ? [row.city] : []),
    hourly_rate_eur:        row.hourly_rate_eur,
    services:               row.services ?? [],
    languages:              row.languages ?? [],
    verified:               row.verified,
    avg_rating:             row.avg_rating,
    review_count:           row.review_count,
    initials:               getInitials(row.display_name),
    avatarColor:            palette.bg,
    avatarText:             palette.text,
    gender,
    availability:           mapAvailability(row.availability),
    cleaner_type:           cleanerType,
    total_jobs_count:       row.total_jobs_count,
    unique_customer_count:  row.unique_customer_count,
    bio:                    row.bio ?? '',
    photo_url:              row.photo_url,
  }
}

const CITY_TABS = [
  { label: 'allCities', value: 'all' },
  { label: 'Nicosia',   value: 'Nicosia' },
  { label: 'Limassol',  value: 'Limassol' },
  { label: 'Larnaca',   value: 'Larnaca' },
  { label: 'Paphos',    value: 'Paphos' },
  { label: 'Ayia Napa', value: 'Ayia Napa' },
]


export default function FeaturedCleaners() {
  const t = useTranslations('cleaners')
  const getCityName = useCity()
  const [activeCity, setActiveCity] = useState('all')
  const [cleaners, setCleaners] = useState<MockCleaner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cleaners', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((rows: DbCleanerRow[]) => setCleaners(rows.map(mapCleaner)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const featured = useMemo(() => {
    return [...cleaners]
      .filter(c => c.verified)
      .sort((a, b) => b.avg_rating - a.avg_rating)
      .slice(0, 6)
  }, [cleaners])

  const filtered = activeCity === 'all'
    ? featured
    : featured.filter(c => c.cities.includes(activeCity))

  return (
    <section className="bg-white py-10 md:py-[72px] px-6 md:px-12 w-full">
      {/* Header */}
      <div className="flex justify-between items-end mb-5 md:mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#19706A] tracking-[0.07em] uppercase mb-2">
            {t('topRated')}
          </p>
          <h2 className="text-[32px] font-medium text-[#0D1F1E] tracking-[-0.01em]">
            {t('featuredTitle')}
          </h2>
        </div>
        <Link
          href="/cleaners"
          className="text-[13px] font-medium text-[#19706A] hover:underline hidden sm:block"
        >
          {t('viewAll')} →
        </Link>
      </div>

      {/* City filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6 md:mb-9">
        {CITY_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveCity(tab.value)}
            className={`rounded-full border-[1.5px] px-4 py-[7px] text-[13px] font-medium cursor-pointer transition-colors ${
              activeCity === tab.value
                ? 'bg-[#E8F4F3] text-[#19706A] border-[#19706A]'
                : 'bg-white text-[#5B7472] border-[#E0EDEC]'
            }`}
          >
            {tab.label === 'allCities' ? t('allCities') : getCityName(tab.label)}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-[#E0EDEC] rounded-[16px] overflow-hidden animate-pulse">
              <div className="h-[120px] bg-[#E0EDEC]" />
              <div className="p-3 pb-3.5 space-y-2">
                <div className="h-3.5 bg-[#E0EDEC] rounded w-3/4" />
                <div className="h-3 bg-[#E0EDEC] rounded w-1/2" />
                <div className="h-3 bg-[#E0EDEC] rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(cleaner => (
            <CleanerCard key={cleaner.id} cleaner={cleaner} />
          ))}
        </div>
      )}
    </section>
  )
}
