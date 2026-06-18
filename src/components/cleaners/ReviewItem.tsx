'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

type Review = {
  id: string
  reviewer_name: string
  rating: number
  body: string
  date: string
}

type Props = {
  review: Review
  locale: string
}

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

export default function ReviewItem({ review, locale }: Props) {
  const t = useTranslations('profile')
  const [showOriginal, setShowOriginal] = useState(false)
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const formattedDate = new Intl.DateTimeFormat(
    locale === 'el' ? 'el-GR' : 'en-GB',
    { month: 'long', year: 'numeric' }
  ).format(new Date(review.date))

  useEffect(() => {
    // Greek chars in the body means it's a Greek review
    const isGreek = /[Ͱ-Ͽἀ-῿]/.test(review.body)
    // Translate: EN locale + Greek review, or EL locale + English review
    const needsTranslation = (locale === 'en' && isGreek) || (locale === 'el' && !isGreek)
    if (!needsTranslation) return

    const targetLocale = isGreek ? 'en' : locale

    const fetchTranslation = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/translate-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewId: review.id,
            text: review.body,
            targetLocale,
          }),
        })
        const data = await res.json()
        if (data.translated && data.translated !== review.body) {
          setTranslated(data.translated)
        }
      } catch {
        // silently fail — show original
      } finally {
        setLoading(false)
      }
    }

    fetchTranslation()
  }, [review.id, review.body, locale])

  const displayText = showOriginal || !translated ? review.body : translated

  return (
    <div className="py-4 border-b border-[#F0F5F4] last:border-none">
      <div className="flex justify-between items-start mb-1.5">
        <span className="text-[13px] font-medium text-[#0D1F1E]">{review.reviewer_name}</span>
        <span className="text-[11px] text-[#6B8886]">{formattedDate}</span>
      </div>

      <div className="mb-2">
        <StarRow rating={review.rating} />
      </div>

      {loading ? (
        <div className="space-y-1.5">
          <div className="h-3 bg-[#F0F5F4] rounded animate-pulse w-full" />
          <div className="h-3 bg-[#F0F5F4] rounded animate-pulse w-4/5" />
          <div className="h-3 bg-[#F0F5F4] rounded animate-pulse w-3/5" />
        </div>
      ) : (
        <p className="text-[13px] text-[#6B8886] leading-relaxed">{displayText}</p>
      )}

      {translated && !loading && (
        <button
          onClick={() => setShowOriginal(prev => !prev)}
          className="text-[11px] text-[#19706A] hover:underline mt-2"
        >
          {showOriginal ? t('seeTranslation') : t('seeOriginal')}
        </button>
      )}
    </div>
  )
}
