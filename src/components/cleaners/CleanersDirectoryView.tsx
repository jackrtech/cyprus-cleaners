'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import CleanerCard from '@/components/cleaners/CleanerCard'
import FilterBar, { FilterState, DEFAULT_FILTERS } from '@/components/cleaners/FilterBar'
import { deriveAvailabilityTags, type WeeklyAvailability } from '@/lib/availability'

type SortKey = 'top-rated' | 'price-asc' | 'price-desc' | 'most-reviews' | 'most-jobs'

interface DbCleanerRow {
  id:                    string
  slug:                  string
  display_name:          string
  bio:                   string | null
  photo_url:             string | null
  cover_photo_url:       string | null
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
  availability:          WeeklyAvailability | null
  is_mock:               boolean
  is_company:            boolean
  created_at:            string
  is_favorited:          boolean
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
    availability:           deriveAvailabilityTags(row.availability),
    cleaner_type:           cleanerType,
    total_jobs_count:       row.total_jobs_count,
    unique_customer_count:  row.unique_customer_count,
    bio:                    row.bio ?? '',
    photo_url:              row.photo_url,
    cover_photo_url:        row.cover_photo_url,
    created_at:             row.created_at,
    is_favorited:           row.is_favorited,
  }
}

export default function CleanersPage() {
  const t = useTranslations('directory')
  const router = useRouter()
  const { data: session } = useSession()
  const isCustomer = (session?.user as { role?: string } | undefined)?.role === 'CUSTOMER'
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('top-rated')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  // Multi-cleaner "team booking" selection mode, added 2026-08-19 — a
  // customer-only toggle that turns each card into a checkbox instead of a
  // profile link. Selected slugs feed the new /cleaners/book-team page.
  const [teamMode, setTeamMode] = useState(false)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])

  function toggleTeamMode() {
    setTeamMode(v => !v)
    setSelectedSlugs([])
  }

  function toggleSelected(slug: string) {
    setSelectedSlugs(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])
  }

  const [cleaners, setCleaners] = useState<MockCleaner[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cleaners', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((rows: DbCleanerRow[]) => setCleaners(rows.map(mapCleaner)))
      .catch(() => setError('Failed to load cleaners. Please refresh.'))
      .finally(() => setLoading(false))
  }, [])

  const results = useMemo(() => {
    let r = [...cleaners]

    if (filters.cities.length) r = r.filter(c => filters.cities.some(fc => c.cities.includes(fc)))
    if (filters.maxRate < 60) r = r.filter(c => c.hourly_rate_eur <= filters.maxRate)
    if (filters.minRating > 0) r = r.filter(c => c.avg_rating >= filters.minRating)
    if (filters.gender !== 'any') r = r.filter(c => c.gender === null || c.gender === filters.gender)
    if (filters.languages.length) r = r.filter(c => filters.languages.every(l => c.languages.includes(l)))
    if (filters.availability.length) r = r.filter(c => filters.availability.every(a => (c.availability as string[]).includes(a)))
    if (filters.cleanerType !== 'any') r = r.filter(c => c.cleaner_type === filters.cleanerType)
    if (filters.verifiedOnly) r = r.filter(c => c.verified)
    if (favoritesOnly) r = r.filter(c => c.is_favorited)

    switch (sort) {
      case 'top-rated':    r.sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count); break
      case 'price-asc':   r.sort((a, b) => a.hourly_rate_eur - b.hourly_rate_eur); break
      case 'price-desc':  r.sort((a, b) => b.hourly_rate_eur - a.hourly_rate_eur); break
      case 'most-reviews': r.sort((a, b) => b.review_count - a.review_count); break
      case 'most-jobs':   r.sort((a, b) => b.total_jobs_count - a.total_jobs_count); break
    }
    return r
  }, [filters, sort, cleaners, favoritesOnly])

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817]">
      {/* Page header */}
      <div className="bg-white dark:bg-[#16211F] border-b border-[#E0EDEC] dark:border-[#253634] px-4 sm:px-10 pt-7 pb-0">
        <nav className="flex items-center gap-1.5 text-[12px] text-[#5B7472] dark:text-[#9BB0AE] mb-2">
          <Link href="/" className="text-[#19706A] hover:underline">{t('breadcrumbHome')}</Link>
          <span>›</span>
          <span>{t('title')}</span>
        </nav>
        <h1 className="text-[28px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] tracking-tight mb-1">{t('title')}</h1>
        <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-5">{t('subtitle', { count: cleaners.length })}</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters}>
      {/* Results — nested inside FilterBar so its sticky bar has room to stay
          pinned for the full scroll height of the list (see FilterBar.tsx) */}
      <div className="px-4 sm:px-10 py-6">
        <div className="flex justify-between items-center mb-5 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{t('found', { count: results.length })}</span>
            {isCustomer && (
              <button
                type="button"
                onClick={() => setFavoritesOnly(v => !v)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                  favoritesOnly
                    ? 'bg-[#FBEAEA] dark:bg-[#3A1F1F] border-[#D64545] text-[#D64545]'
                    : 'bg-white dark:bg-[#16211F] border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:border-[#D64545] hover:text-[#D64545]'
                }`}
              >
                {t('favoritesOnly')}
              </button>
            )}
            {isCustomer && (
              <button
                type="button"
                onClick={toggleTeamMode}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                  teamMode
                    ? 'bg-[#E8F4F3] dark:bg-[#17302D] border-[#19706A] text-[#19706A]'
                    : 'bg-white dark:bg-[#16211F] border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:border-[#19706A] hover:text-[#19706A]'
                }`}
              >
                {teamMode ? t('teamModeExit') : t('teamModeEnter')}
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="border border-[#E0EDEC] dark:border-[#253634] rounded-[8px] px-3 py-1.5 text-[13px] bg-white dark:bg-[#16211F] outline-none cursor-pointer"
          >
            <option value="top-rated">{t('sortTopRated')}</option>
            <option value="price-asc">{t('sortPriceLow')}</option>
            <option value="price-desc">{t('sortPriceHigh')}</option>
            <option value="most-reviews">{t('sortMostReviews')}</option>
            <option value="most-jobs">{t('sortMostJobs')}</option>
          </select>
        </div>

        {error ? (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
            {error}
          </p>
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white dark:bg-[#16211F] border border-[#E0EDEC] dark:border-[#253634] rounded-[16px] p-3.5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#E0EDEC] dark:bg-[#253634] shrink-0" />
                  <div className="flex-1 space-y-2 pt-0.5">
                    <div className="h-3.5 bg-[#E0EDEC] dark:bg-[#253634] rounded w-3/4" />
                    <div className="h-3 bg-[#E0EDEC] dark:bg-[#253634] rounded w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-[#E0EDEC] dark:bg-[#253634] rounded w-2/3 mt-3" />
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {results.map(cleaner => (
              <CleanerCard
                key={cleaner.id}
                cleaner={cleaner}
                selectMode={teamMode}
                selected={selectedSlugs.includes(cleaner.slug)}
                onToggleSelect={() => toggleSelected(cleaner.slug)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-16">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-[#C5D8D6]">
              <circle cx="21" cy="21" r="13" stroke="currentColor" strokeWidth="2.5" />
              <path d="M31 31l10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p className="text-[16px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mt-4">{t('noResults')}</p>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mt-1">{t('noResultsSub')}</p>
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-5 border border-[#E0EDEC] dark:border-[#253634] rounded-full px-6 py-2 text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] hover:border-[#19706A] hover:text-[#19706A] transition-colors"
            >
              {t('emptyAction')}
            </button>
          </div>
        )}
      </div>
      </FilterBar>

      {/* Floating CTA for team-booking selection — needs 2+ cleaners picked */}
      {teamMode && selectedSlugs.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-[#0D1F1E] dark:bg-[#ECF3F2] text-white dark:text-[#0D1F1E] rounded-full shadow-lg pl-5 pr-2 py-2 flex items-center gap-3">
          <span className="text-[13px]">{t('teamModeCount', { count: selectedSlugs.length })}</span>
          <button
            type="button"
            disabled={selectedSlugs.length < 2}
            onClick={() => router.push(`/cleaners/book-team?slugs=${selectedSlugs.join(',')}`)}
            className="btn-primary !px-4 !py-1.5 text-[13px] rounded-full disabled:opacity-50"
          >
            {t('teamModeContinue')}
          </button>
        </div>
      )}
    </div>
  )
}
