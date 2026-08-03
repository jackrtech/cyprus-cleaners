'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { extractErrorMessage } from '@/lib/utils'

interface Review {
  id:         string
  booking_id: string
  rating:     number
  body:       string | null
  created_at: string
}

interface ReviewPromptProps {
  bookingId:    string
  cleanerName:  string
  subtitle:     string
  onSubmitted?: (review: Review) => void
  onSkip?:      () => void
}

function StarPicker({ rating, hoverRating, onHover, onPick }: {
  rating:      number
  hoverRating: number
  onHover:     (n: number) => void
  onPick:      (n: number) => void
}) {
  const active = hoverRating || rating
  return (
    <div className="flex gap-1" onMouseLeave={() => onHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => onHover(n)}
          onClick={() => onPick(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="text-[28px] leading-none transition-transform hover:scale-110"
          style={{ color: n <= active ? '#F2C94C' : '#D9D9D9' }}
        >
          {n <= active ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

export default function ReviewPrompt({ bookingId, cleanerName, subtitle, onSubmitted, onSkip }: ReviewPromptProps) {
  const t = useTranslations('review.prompt')

  const [rating,      setRating]      = useState(0)
  const [hoverRating,  setHoverRating] = useState(0)
  const [bodyText,     setBodyText]    = useState('')
  const [submitting,   setSubmitting]  = useState(false)
  const [submitted,    setSubmitted]   = useState(false)
  const [error,        setError]       = useState<string | null>(null)

  async function handleSubmit() {
    if (rating < 1 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/reviews', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking_id: bookingId, rating, body: bodyText.trim() || undefined }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Something went wrong. Please try again.'))
      const review: Review = await res.json()
      setSubmitted(true)
      onSubmitted?.(review)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="card p-5 text-center">
        <p className="text-[14px] font-medium text-[#0D1F1E]">{t('thanks')}</p>
        <p className="text-[13px] text-[#6B8886] mt-1">{t('thanksSub')}</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <p className="text-[15px] font-medium text-[#0D1F1E]">{t('title', { name: cleanerName })}</p>
      <p className="text-[12px] text-[#6B8886] mt-0.5 mb-3">{subtitle}</p>

      <StarPicker rating={rating} hoverRating={hoverRating} onHover={setHoverRating} onPick={setRating} />

      <textarea
        value={bodyText}
        onChange={e => setBodyText(e.target.value.slice(0, 1000))}
        placeholder={t('placeholder')}
        rows={2}
        className="input !py-2 text-[13px] resize-none w-full mt-3"
      />

      {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={rating < 1 || submitting}
          className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
        >
          {t('submit')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="btn-ghost !px-4 !py-2 text-[13px] rounded-full"
        >
          {t('skip')}
        </button>
      </div>
    </div>
  )
}
