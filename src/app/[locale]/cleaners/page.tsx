'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { MOCK_CLEANERS } from '@/lib/mockCleaners'
import CleanerCard from '@/components/cleaners/CleanerCard'
import FilterBar, { FilterState, DEFAULT_FILTERS } from '@/components/cleaners/FilterBar'

type SortKey = 'top-rated' | 'price-asc' | 'price-desc' | 'most-reviews' | 'most-jobs'

export default function CleanersPage() {
  const t = useTranslations('directory')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('top-rated')

  const results = useMemo(() => {
    let r = [...MOCK_CLEANERS]

    if (filters.cities.length) r = r.filter(c => filters.cities.some(fc => c.cities.includes(fc)))
    if (filters.maxRate < 40) r = r.filter(c => c.hourly_rate_eur <= filters.maxRate)
    if (filters.minRating !== null) r = r.filter(c => c.avg_rating >= filters.minRating!)
    if (filters.gender !== 'any') r = r.filter(c => c.gender === null || c.gender === filters.gender)
    if (filters.languages.length) r = r.filter(c => filters.languages.every(l => c.languages.includes(l)))
    if (filters.availability.length) r = r.filter(c => filters.availability.every(a => (c.availability as string[]).includes(a)))
    if (filters.cleanerType !== 'any') r = r.filter(c => c.cleaner_type === filters.cleanerType)
    if (filters.verifiedOnly) r = r.filter(c => c.verified)

    switch (sort) {
      case 'top-rated':    r.sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count); break
      case 'price-asc':   r.sort((a, b) => a.hourly_rate_eur - b.hourly_rate_eur); break
      case 'price-desc':  r.sort((a, b) => b.hourly_rate_eur - a.hourly_rate_eur); break
      case 'most-reviews': r.sort((a, b) => b.review_count - a.review_count); break
      case 'most-jobs':   r.sort((a, b) => b.total_jobs_count - a.total_jobs_count); break
    }
    return r
  }, [filters, sort])

  const verifiedCount = MOCK_CLEANERS.filter(c => c.verified).length

  return (
    <div className="min-h-screen bg-[#F7FAF9]">
      {/* Page header */}
      <div className="bg-white border-b border-[#E0EDEC] px-10 pt-7 pb-0">
        <nav className="flex items-center gap-1.5 text-[12px] text-[#6B8886] mb-2">
          <Link href="/" className="text-[#19706A] hover:underline">{t('breadcrumbHome')}</Link>
          <span>›</span>
          <span>{t('title')}</span>
        </nav>
        <h1 className="text-[28px] font-medium text-[#0D1F1E] tracking-tight mb-1">{t('title')}</h1>
        <p className="text-[13px] text-[#6B8886] mb-5">{t('subtitle', { count: verifiedCount })}</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {/* Results */}
      <div className="px-10 py-6">
        <div className="flex justify-between items-center mb-5">
          <span className="text-[13px] text-[#6B8886]">{t('found', { count: results.length })}</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="border border-[#E0EDEC] rounded-[8px] px-3 py-1.5 text-[13px] bg-white outline-none cursor-pointer"
          >
            <option value="top-rated">{t('sortTopRated')}</option>
            <option value="price-asc">{t('sortPriceLow')}</option>
            <option value="price-desc">{t('sortPriceHigh')}</option>
            <option value="most-reviews">{t('sortMostReviews')}</option>
            <option value="most-jobs">{t('sortMostJobs')}</option>
          </select>
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map(cleaner => (
              <CleanerCard key={cleaner.id} cleaner={cleaner} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-16">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-[#C5D8D6]">
              <circle cx="21" cy="21" r="13" stroke="currentColor" strokeWidth="2.5" />
              <path d="M31 31l10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p className="text-[16px] font-medium text-[#0D1F1E] mt-4">{t('noResults')}</p>
            <p className="text-[13px] text-[#6B8886] mt-1">{t('noResultsSub')}</p>
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-5 border border-[#E0EDEC] rounded-full px-6 py-2 text-[13px] text-[#0D1F1E] hover:border-[#19706A] hover:text-[#19706A] transition-colors"
            >
              {t('emptyAction')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
