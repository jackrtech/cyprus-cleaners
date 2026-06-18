'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'

function StarRow({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="text-[11px] leading-none">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'text-[#F2C94C]' : 'text-[#D9D9D9]'}>
          {i < full ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

export default function CleanerCard({ cleaner }: { cleaner: MockCleaner }) {
  const t = useTranslations('cleaners')
  const tCommon = useTranslations('common')
  const getCityName = useCity()
  return (
    <Link
      href={`/cleaners/${cleaner.slug}`}
      className="group block bg-white border border-[#E0EDEC] rounded-[16px] overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(25,112,106,0.14)]"
    >
      {/* Photo area */}
      <div
        className="h-[120px] relative flex items-center justify-center"
        style={{ background: cleaner.avatarColor }}
      >
        <div
          className="w-14 h-14 rounded-full border-[3px] border-white flex items-center justify-center text-[20px] font-medium bg-white"
          style={{ color: cleaner.avatarText }}
        >
          {cleaner.initials}
        </div>
        {cleaner.verified && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#19706A] rounded-full px-2 py-0.5">
            <span className="w-1 h-1 rounded-full bg-white shrink-0" />
            <span className="text-[9px] font-medium text-white">{t('verified')}</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 pb-3.5">
        <div className="flex justify-between items-start mb-0.5">
          <span className="text-[13px] font-medium text-[#0D1F1E] leading-snug">{cleaner.display_name}</span>
          <span className="text-right shrink-0 ml-1.5">
            <span className="text-[12px] font-medium text-[#0D1F1E]">€{cleaner.hourly_rate_eur}</span>
            <span className="text-[10px] text-[#6B8886]">{tCommon('perHour')}</span>
          </span>
        </div>

        <span className="inline-block bg-[#E6F1FF] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[10px] font-medium my-1.5">
          {getCityName(cleaner.city)}
        </span>

        <div className="flex gap-1 flex-wrap mb-2.5">
          <span className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[10px] font-medium">
            {cleaner.languages.join(' · ')}
          </span>
        </div>

        <div className="border-t border-[#F0F5F4] pt-2 flex justify-between items-center">
          <div className="flex items-center gap-1">
            <StarRow rating={cleaner.avg_rating} />
            <span className="text-[11px] text-[#6B8886] ml-0.5">
              {cleaner.avg_rating} ({cleaner.review_count})
            </span>
          </div>
          <span className="bg-[#E8F4F3] text-[#19706A] rounded-full px-2.5 py-1 text-[10px] font-medium group-hover:bg-[#19706A] group-hover:text-white transition-colors">
            {t('viewProfile')}
          </span>
        </div>
      </div>
    </Link>
  )
}
