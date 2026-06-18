'use client'

import { notFound } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Link } from '@/navigation'
import { MOCK_CLEANERS, MOCK_REVIEWS } from '@/lib/mockCleaners'
import ReviewItem from '@/components/cleaners/ReviewItem'

function StarRow({ rating, size = 12 }: { rating: number; size?: number }) {
  const full = Math.round(rating)
  return (
    <span style={{ fontSize: size }} className="leading-none">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'text-[#F2C94C]' : 'text-[#D9D9D9]'}>
          {i < full ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function CleanerProfilePage({ params }: { params: { slug: string } }) {
  const t = useTranslations('profile')
  const locale = useLocale()
  const { data: session } = useSession()
  const cleaner = MOCK_CLEANERS.find(c => c.slug === params.slug)
  if (!cleaner) notFound()

  const reviews = MOCK_REVIEWS.filter(r => r.cleaner_slug === cleaner.slug)
  const firstName = cleaner.display_name.split(' ')[0]
  const uniqueCustomers = Math.round(cleaner.total_jobs_count * 0.7)

  // Auth-aware intro button
  const role = (session?.user as { role?: string } | undefined)?.role
  const introHref = !session ? '/login' : role === 'CUSTOMER' ? `/introductions/new?cleaner=${cleaner.slug}` : null

  return (
    <div className="min-h-screen bg-[#F7FAF9]">
      {/* Page header */}
      <div className="bg-white border-b border-[#E0EDEC] px-10 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12px] text-[#6B8886] mb-5">
          <Link href="/" className="text-[#19706A] hover:underline">{t('breadcrumbHome')}</Link>
          <span>›</span>
          <Link href="/cleaners" className="text-[#19706A] hover:underline">{t('breadcrumbFind')}</Link>
          <span>›</span>
          <span>{cleaner.display_name}</span>
        </nav>

        {/* Profile top row */}
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="w-[88px] h-[88px] rounded-full border-[3px] border-white flex items-center justify-center text-[32px] font-medium"
              style={{
                background: cleaner.avatarColor,
                color: cleaner.avatarText,
                boxShadow: '0 2px 8px rgba(25,112,106,0.15)',
              }}
            >
              {cleaner.initials}
            </div>
            {cleaner.verified && (
              <div className="absolute -bottom-1 -right-1 flex items-center gap-1 bg-[#19706A] rounded-full px-2 py-0.5 border-[2px] border-white">
                <span className="w-1 h-1 rounded-full bg-white shrink-0" />
                <span className="text-[9px] font-medium text-white">Verified</span>
              </div>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-[26px] font-medium text-[#0D1F1E]">{cleaner.display_name}</h1>
              <span className="bg-[#E6F1FF] text-[#2D8CFF] rounded-[6px] px-2.5 py-0.5 text-[12px] font-medium">{cleaner.city}</span>
            </div>
            <div className="flex gap-4 items-center flex-wrap text-[13px] text-[#6B8886] mb-3">
              <button
                onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity cursor-pointer group"
              >
                <StarRow rating={cleaner.avg_rating} />
                <span className="group-hover:text-[#19706A] transition-colors group-hover:underline underline-offset-2">
                  {cleaner.avg_rating} · {cleaner.review_count} reviews
                </span>
              </button>
              <span>·</span>
              <span>{cleaner.total_jobs_count} jobs completed</span>
              <span>·</span>
              <span>{uniqueCustomers} unique customers</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <span className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                {cleaner.languages.join(' · ')}
              </span>
              <span className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                {cap(cleaner.cleaner_type)}
              </span>
            </div>
          </div>

          {/* Rate + CTA */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <p className="text-[12px] text-[#6B8886]">{t('hourlyRate')}</p>
            <p className="text-[26px] font-medium text-[#0D1F1E] leading-none">
              €{cleaner.hourly_rate_eur}<span className="text-[14px] text-[#6B8886] font-normal">/hr</span>
            </p>
            {introHref ? (
              <Link href={introHref} className="btn-primary rounded-full px-6 py-3 text-[14px] whitespace-nowrap">
                {t('messageBtn', { name: firstName })} →
              </Link>
            ) : (
              <button disabled className="btn-primary rounded-full px-6 py-3 text-[14px] opacity-40 cursor-not-allowed whitespace-nowrap">
                N/A
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body: left + right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-10 py-7">
        {/* Left column */}
        <div>
          {/* About */}
          <div className="bg-white border border-[#E0EDEC] rounded-[16px] p-6 mb-4">
            <h2 className="text-[15px] font-medium text-[#0D1F1E] mb-3">{t('about', { name: firstName })}</h2>
            <p className="text-[14px] text-[#6B8886] leading-relaxed">{cleaner.bio}</p>
          </div>

          {/* Reviews */}
          <div id="reviews" className="bg-white border border-[#E0EDEC] rounded-[16px] p-6">
            <h2 className="text-[15px] font-medium text-[#0D1F1E] mb-1">
              {t('reviews')} ({cleaner.review_count})
            </h2>
            <div>
              {reviews.map(review => (
                <ReviewItem key={review.id} review={review} locale={locale} />
              ))}
            </div>
          </div>
        </div>

        {/* Right column — sticky booking card */}
        <div>
          <div className="sticky top-6 bg-white border border-[#E0EDEC] rounded-[16px] p-6">
            <div className="mb-1">
              <span className="text-[28px] font-medium text-[#0D1F1E]">€{cleaner.hourly_rate_eur}</span>
              <span className="text-[14px] text-[#6B8886]">/hr</span>
            </div>
            <button
              onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-1.5 text-[13px] text-[#6B8886] mb-5 hover:opacity-70 transition-opacity cursor-pointer group"
            >
              <StarRow rating={cleaner.avg_rating} />
              <span className="group-hover:text-[#19706A] transition-colors">{cleaner.avg_rating} · {cleaner.review_count} reviews</span>
            </button>

            <div className="border-t border-[#E0EDEC] my-4" />

            <div className="space-y-2.5 mb-4">
              {[
                { label: t('languages'), value: cleaner.languages.join(', ') },
                { label: t('city'), value: cleaner.city },
                { label: t('type'), value: cap(cleaner.cleaner_type) },
                { label: t('availability'), value: cleaner.availability.map(cap).join(', ') },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-[13px]">
                  <span className="text-[#6B8886]">{row.label}</span>
                  <span className="text-[#0D1F1E] font-medium text-right ml-4">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#E0EDEC] my-4" />

            {introHref ? (
              <Link href={introHref} className="btn-primary w-full text-center rounded-full py-3 text-[14px] block">
                {t('messageBtn', { name: firstName })} →
              </Link>
            ) : (
              <button disabled className="btn-primary w-full rounded-full py-3 text-[14px] opacity-40 cursor-not-allowed">
                N/A
              </button>
            )}

            <p className="text-[11px] text-[#6B8886] text-center mt-3 leading-relaxed">
              {t('unlockNote', { name: firstName })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
