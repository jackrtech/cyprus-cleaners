'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { MOCK_CLEANERS } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'

const CITY_TABS = [
  { label: 'allCities', value: 'all' },
  { label: 'Nicosia',   value: 'Nicosia' },
  { label: 'Limassol',  value: 'Limassol' },
  { label: 'Larnaca',   value: 'Larnaca' },
  { label: 'Paphos',    value: 'Paphos' },
  { label: 'Ayia Napa', value: 'Ayia Napa' },
]

function StarRow({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="text-[12px] leading-none">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'text-[#F2C94C]' : 'text-[#D9D9D9]'}>
          {i < full ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

export default function FeaturedCleaners() {
  const t = useTranslations('cleaners')
  const getCityName = useCity()
  const [activeCity, setActiveCity] = useState('all')

  const filtered = activeCity === 'all'
    ? MOCK_CLEANERS
    : MOCK_CLEANERS.filter(c => c.city === activeCity)

  return (
    <section className="bg-white py-[72px] px-6 md:px-12 w-full">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
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
      <div className="flex gap-2 flex-wrap mb-9">
        {CITY_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveCity(tab.value)}
            className={`rounded-full border-[1.5px] px-4 py-[7px] text-[13px] cursor-pointer transition-all ${
              activeCity === tab.value
                ? 'bg-[#E8F4F3] text-[#19706A] border-[#19706A] font-medium'
                : 'bg-white text-[#6B8886] border-[#E0EDEC]'
            }`}
          >
            {tab.label === 'allCities' ? t('allCities') : getCityName(tab.label)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(cleaner => (
          <Link
            key={cleaner.id}
            href={`/cleaners/${cleaner.slug}`}
            className="group block bg-white border border-[#E0EDEC] rounded-[16px] overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
            style={{ '--hover-shadow': '0 4px 16px rgba(25,112,106,0.14)' } as React.CSSProperties}
          >
            <div
              className="transition-shadow duration-200 group-hover:[box-shadow:0_4px_16px_rgba(25,112,106,0.14)] rounded-[16px]"
            >
              {/* Photo area */}
              <div className="h-[180px] relative bg-[#F7FAF9] flex items-center justify-center">
                <div
                  className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center text-[22px] font-medium"
                  style={{ background: cleaner.avatarColor, color: cleaner.avatarText }}
                >
                  {cleaner.initials}
                </div>

                {cleaner.verified && (
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-white border border-[#E8F4F3] rounded-[6px] px-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#19706A] shrink-0" />
                    <span className="text-[10px] font-medium text-[#19706A]">{t('verified')}</span>
                  </div>
                )}
              </div>

              {/* Card body */}
              <div className="p-4">
                {/* Name + rate */}
                <div className="flex justify-between items-start mb-1.5">
                  <span className="text-[15px] font-medium text-[#0D1F1E]">{cleaner.display_name}</span>
                  <span className="text-right shrink-0 ml-2">
                    <span className="text-[14px] font-medium text-[#0D1F1E]">€{cleaner.hourly_rate_eur}</span>
                    <span className="text-[12px] text-[#6B8886]">{t('perHour')}</span>
                  </span>
                </div>

                {/* City */}
                <div className="mb-2.5">
                  <span className="inline bg-[#E6F1FF] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                    {getCityName(cleaner.city)}
                  </span>
                </div>

                {/* Service + language tags */}
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {cleaner.services.map(s => (
                    <span key={s} className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                      {s === 'HOUSE' ? 'House' : 'Apartment'}
                    </span>
                  ))}
                  <span className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                    {cleaner.languages.join(' · ')}
                  </span>
                </div>

                {/* Divider */}
                <div className="border-t border-[#F0F5F4] pt-3 flex justify-between items-center">
                  {/* Stars + count */}
                  <div className="flex items-center gap-1">
                    <StarRow rating={cleaner.avg_rating} />
                    <span className="text-[12px] text-[#6B8886] ml-1">
                      {cleaner.avg_rating} ({cleaner.review_count})
                    </span>
                  </div>
                  {/* View profile */}
                  <span className="bg-[#E8F4F3] text-[#19706A] rounded-full px-3.5 py-1.5 text-[12px] font-medium hover:bg-[#19706A] hover:text-white transition-colors">
                    {t('viewProfile')}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
