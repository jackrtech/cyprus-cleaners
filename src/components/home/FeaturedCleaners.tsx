'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { MOCK_CLEANERS } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'
import CleanerCard from '@/components/cleaners/CleanerCard'

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

  const filtered = activeCity === 'all'
    ? MOCK_CLEANERS
    : MOCK_CLEANERS.filter(c => c.cities.includes(activeCity))

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
          <CleanerCard key={cleaner.id} cleaner={cleaner} />
        ))}
      </div>
    </section>
  )
}
