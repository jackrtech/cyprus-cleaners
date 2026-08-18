'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import { useCity } from '@/hooks/useCity'
import { getTenure } from '@/lib/utils'

function TenureLabel({ createdAt }: { createdAt?: string }) {
  const t = useTranslations('cleaners')
  if (!createdAt) return null
  const tenure = getTenure(createdAt)
  if (!tenure) return <span>{t('newToThePlatform')}</span>
  const key = tenure.unit === 'weeks' ? 'memberForWeeks' : tenure.unit === 'months' ? 'memberForMonths' : 'memberForYears'
  return <span>{t(key, { count: tenure.count })}</span>
}

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
      className="group block bg-white dark:bg-[#16211F] border border-[#E0EDEC] dark:border-[#253634] rounded-[16px] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(25,112,106,0.14)]"
    >
      {/* Header — modest avatar, name + verified badge, rate */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {cleaner.photo_url ? (
            <img
              src={cleaner.photo_url}
              alt={cleaner.display_name}
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-[20px] font-medium"
              style={{ background: cleaner.avatarColor, color: cleaner.avatarText }}
            >
              {cleaner.initials}
            </div>
          )}
          {cleaner.verified && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#19706A] border-2 border-white dark:border-[#16211F] flex items-center justify-center" title={t('verified')}>
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex justify-between items-start gap-1.5">
            <span className="text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] leading-snug truncate">{cleaner.display_name}</span>
            <span className="text-right shrink-0">
              <span className="text-[12px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">€{cleaner.hourly_rate_eur}</span>
              <span className="text-[10px] text-[#5B7472] dark:text-[#9BB0AE]">{tCommon('perHour')}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <StarRow rating={cleaner.avg_rating} />
            <span className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] ml-0.5">
              {cleaner.avg_rating} ({cleaner.review_count})
            </span>
          </div>
          <div className="text-[10.5px] text-[#5B7472] dark:text-[#9BB0AE] mt-0.5">
            <TenureLabel createdAt={cleaner.created_at} />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1 mt-2.5 flex-wrap">
        <span className="inline-block bg-[#E6F1FF] dark:bg-[#122A42] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[10px] font-medium">
          {getCityName(cleaner.cities[0])}
        </span>
        {cleaner.cities.length > 1 && (
          <span className="text-[10px] text-[#5B7472] dark:text-[#9BB0AE]">+{cleaner.cities.length - 1} more</span>
        )}
        <span className="bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[10px] font-medium">
          {cleaner.languages.join(' · ')}
        </span>
      </div>

      <div className="border-t border-[#F0F5F4] dark:border-[#142220] mt-2.5 pt-2 flex justify-end">
        <span className="bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A] rounded-full px-2.5 py-1 text-[10px] font-medium group-hover:bg-[#19706A] group-hover:text-white transition-colors">
          {t('viewProfile')}
        </span>
      </div>
    </Link>
  )
}
