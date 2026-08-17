'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'
import LoadingImage from '@/components/ui/LoadingImage'

function StarRow({ rating }: { rating: number }) {
  const t = useTranslations('cleaners')
  const full = Math.round(rating)
  return (
    <span className="text-[11px] leading-none" role="img" aria-label={t('starRating', { rating })}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < full ? 'text-[#7A5F00]' : 'text-[#D9D9D9] dark:text-[#3A4644]'}>
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
      className="group block bg-white border border-[#E0EDEC] dark:border-[#253634] rounded-[16px] overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(25,112,106,0.14)]"
    >
      {/* Cover photo — falls back to a plain colour when the cleaner hasn't set one */}
      <div
        className="h-[120px] relative"
        style={cleaner.cover_photo_url ? undefined : { background: cleaner.avatarColor }}
      >
        {cleaner.cover_photo_url && (
          <LoadingImage
            src={cleaner.cover_photo_url}
            wrapperClassName="absolute inset-0"
            className="object-cover"
          />
        )}
        {cleaner.verified && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-[#19706A] rounded-full px-2 py-0.5">
            <span className="w-1 h-1 rounded-full bg-white shrink-0" />
            <span className="text-[9px] font-medium text-white">{t('verified')}</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="px-3 pb-3.5">
        {/* Avatar — overlaps the boundary between the cover photo and the body.
            Biggest on mobile (single-column cards have the most room), a
            bit smaller on desktop grid columns, but still clearly bigger
            than the original 56px which read as too small there too. */}
        <div className="-mt-10 sm:-mt-8 mb-2 relative z-10">
          {cleaner.photo_url ? (
            <img
              src={cleaner.photo_url}
              alt={cleaner.display_name}
              className="w-20 h-20 sm:w-16 sm:h-16 rounded-full object-cover border-[3px] border-white shadow-sm"
            />
          ) : (
            <div
              className="w-20 h-20 sm:w-16 sm:h-16 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center text-[26px] sm:text-[22px] font-medium bg-white"
              style={{ color: cleaner.avatarText }}
            >
              {cleaner.initials}
            </div>
          )}
        </div>

        <div className="flex justify-between items-start mb-0.5">
          <span className="text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] leading-snug">{cleaner.display_name}</span>
          <span className="text-right shrink-0 ml-1.5">
            <span className="text-[12px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">€{cleaner.hourly_rate_eur}</span>
            <span className="text-[10px] text-[#5B7472] dark:text-[#9BB0AE]">{tCommon('perHour')}</span>
          </span>
        </div>

        <div className="flex items-center gap-1 my-1.5 flex-wrap">
          <span className="inline-block bg-[#E6F1FF] dark:bg-[#122A42] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[10px] font-medium">
            {getCityName(cleaner.cities[0])}
          </span>
          {cleaner.cities.length > 1 && (
            <span className="text-[10px] text-[#5B7472] dark:text-[#9BB0AE]">+{cleaner.cities.length - 1} more</span>
          )}
        </div>

        <div className="flex gap-1 flex-wrap mb-2.5">
          <span className="bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[10px] font-medium">
            {cleaner.languages.join(' · ')}
          </span>
        </div>

        <div className="border-t border-[#F0F5F4] dark:border-[#142220] pt-2 flex justify-between items-center">
          <div className="flex items-center gap-1">
            <StarRow rating={cleaner.avg_rating} />
            <span className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] ml-0.5">
              {cleaner.avg_rating} ({cleaner.review_count})
            </span>
          </div>
          <span className="bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A] rounded-full px-2.5 py-1 text-[10px] font-medium group-hover:bg-[#19706A] group-hover:text-white transition-colors">
            {t('viewProfile')}
          </span>
        </div>
      </div>
    </Link>
  )
}
