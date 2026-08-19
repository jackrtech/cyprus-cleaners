'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Link, useRouter } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import ReviewItem from '@/components/cleaners/ReviewItem'
import { useCity } from '@/hooks/useCity'
import ChatModal from '@/components/chat/ChatModal'
import LoadingImage from '@/components/ui/LoadingImage'
import { getTenure } from '@/lib/utils'
import { deriveAvailabilityTags } from '@/lib/availability'
import type { CleanerDetailRow, CleanerReviewRow } from '@/lib/cleaners'

interface DbCleanerRow extends CleanerDetailRow {
  booking_fee_eur: number
}

type DbReviewRow = CleanerReviewRow

interface ProfileReview {
  id:            string
  reviewer_name: string
  rating:        number
  body:          string
  date:          string
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
    has_transport:          row.has_transport,
    created_at:             row.created_at,
    booking_fee_eur:        row.booking_fee_eur,
    is_favorited:           row.is_favorited,
    offerings:              row.cleaner_service_offerings ?? [],
  }
}

function mapReview(row: DbReviewRow): ProfileReview {
  return {
    id:            row.id,
    reviewer_name: row.users?.full_name ?? 'Verified Customer',
    rating:        row.rating,
    body:          row.body,
    date:          row.created_at,
  }
}

function StarRow({ rating, size = 12 }: { rating: number; size?: number }) {
  const t = useTranslations('profile')
  const full = Math.round(rating)
  return (
    <span style={{ fontSize: size }} className="leading-none" role="img" aria-label={t('starRating', { rating })}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < full ? 'text-[#7A5F00]' : 'text-[#D9D9D9] dark:text-[#3A4644]'}>
          {i < full ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

export default function CleanerProfileView({
  initialCleaner, initialReviews,
}: {
  initialCleaner: DbCleanerRow
  initialReviews: DbReviewRow[]
}) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const tFilters = useTranslations('filters')
  const locale = useLocale()
  const getCityName = useCity()
  const { data: session } = useSession()
  const [threadId,       setThreadId]       = useState<string | null>(null)
  const [chatOpen,       setChatOpen]       = useState(false)
  const [wantsBookingForm, setWantsBookingForm] = useState(false)
  const [creatingThread, setCreatingThread] = useState(false)
  const [cleanerToast,   setCleanerToast]   = useState(false)
  const [chatError,      setChatError]      = useState(false)
  const router = useRouter()

  const [cleaner] = useState<MockCleaner>(() => mapCleaner(initialCleaner))
  const isOwnProfile = initialCleaner.is_own_profile

  const [reviews] = useState<ProfileReview[]>(() => initialReviews.map(mapReview))

  const [favorited,  setFavorited]  = useState(initialCleaner.is_favorited)
  const [favPending, setFavPending] = useState(false)

  // Check for an existing thread with this cleaner (CUSTOMER only) — purely
  // for button-label purposes ("Message" vs "Open chat"), never gates access.
  // Genuinely session-dependent (needs the client auth session) and
  // non-blocking, so this stays a client-side fetch rather than moving to
  // the server-rendered initial load like the cleaner/reviews data above.
  useEffect(() => {
    const userRole = (session?.user as { role?: string } | undefined)?.role
    if (!session || userRole !== 'CUSTOMER') {
      setThreadId(null)
      return
    }
    let cancelled = false
    fetch('/api/introductions')
      .then(r => r.ok ? r.json() : [])
      .then((intros: { id: string; cleaner_profiles: { id: string } | null }[]) => {
        if (cancelled) return
        const existing = intros.find(i => i.cleaner_profiles?.id === cleaner.id)
        setThreadId(existing?.id ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [cleaner.id, session])

  const firstName = cleaner.display_name.split(' ')[0]
  const uniqueCustomers = cleaner.unique_customer_count

  // Auth-aware intro button
  const role = (session?.user as { role?: string } | undefined)?.role

  async function ensureThreadAndOpenChat(openBookingForm: boolean) {
    if (!session) {
      router.push(`/login?return=/cleaners/${cleaner.slug}`)
      return
    }
    if (role !== 'CUSTOMER') {
      setCleanerToast(true)
      setTimeout(() => setCleanerToast(false), 3000)
      return
    }
    setWantsBookingForm(openBookingForm)
    if (threadId) {
      setChatOpen(true)
      return
    }
    setCreatingThread(true)
    try {
      const res = await fetch('/api/introductions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cleaner_profile_id: cleaner.id }),
      })
      if (!res.ok) throw new Error()
      const data: { id: string } = await res.json()
      setThreadId(data.id)
      setChatOpen(true)
    } catch {
      setChatError(true)
      setTimeout(() => setChatError(false), 3000)
    } finally {
      setCreatingThread(false)
    }
  }

  const handleIntroClick = () => ensureThreadAndOpenChat(false)
  const handleBookClick  = () => ensureThreadAndOpenChat(true)

  async function toggleFavorite() {
    if (favPending) return
    if (!session) {
      router.push(`/login?return=/cleaners/${cleaner.slug}`)
      return
    }
    const next = !favorited
    setFavorited(next)
    setFavPending(true)
    try {
      const res = next
        ? await fetch('/api/favorites', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ cleaner_profile_id: cleaner.id }),
          })
        : await fetch(`/api/favorites/${cleaner.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      setFavorited(!next)
    } finally {
      setFavPending(false)
    }
  }

  // Gendered / locale-aware labels
  const messageLabel = locale === 'el'
    ? cleaner.gender === 'female'
      ? t('messageBtnFemale', { name: firstName })
      : cleaner.gender === 'male'
        ? t('messageBtnMale', { name: firstName })
        : t('messageBtnCompany', { name: firstName })
    : t('messageBtn', { name: firstName })

  const bookLabel = locale === 'el'
    ? cleaner.gender === 'female'
      ? t('bookBtnFemale', { name: firstName })
      : cleaner.gender === 'male'
        ? t('bookBtnMale', { name: firstName })
        : t('bookBtnCompany', { name: firstName })
    : t('bookBtn', { name: firstName })

  const verifiedLabel = locale === 'el'
    ? cleaner.gender === 'female'
      ? t('verifiedFemale')
      : cleaner.gender === 'male'
        ? t('verifiedMale')
        : t('verifiedCompany')
    : t('verified')

  const cleanerTypeLabel = cleaner.cleaner_type === 'company'
    ? t('company')
    : locale === 'el'
      ? cleaner.gender === 'female'
        ? t('individualFemale')
        : t('individualMale')
      : t('individual')

  const tenure = cleaner.created_at ? getTenure(cleaner.created_at) : null
  const tenureLabel = !cleaner.created_at
    ? null
    : tenure
      ? t(tenure.unit === 'weeks' ? 'memberForWeeks' : tenure.unit === 'months' ? 'memberForMonths' : 'memberForYears', { count: tenure.count })
      : t('newToThePlatform')

  const availabilityLabel = cleaner.availability
    .map(a => tFilters(a as 'weekdays' | 'weekends' | 'evenings'))
    .join(', ')

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817]">
      {/* Page header */}
      <div className="bg-white dark:bg-[#16211F] border-b border-[#E0EDEC] dark:border-[#253634] px-4 sm:px-10 py-6">
        {/* Breadcrumb — replaced with a preview banner + one-tap exit when a
            cleaner is looking at their own public profile, so it reads as
            "previewing" rather than "I've wandered into the live site" */}
        {isOwnProfile ? (
          <div className="flex items-center justify-between gap-3 flex-wrap bg-[#E8F4F3] dark:bg-[#17302D] border border-[#19706A]/20 rounded-[10px] px-4 py-2.5 mb-5">
            <span className="text-[13px] text-[#19706A] font-medium">{t('previewingOwnProfile')}</span>
            <Link href="/dashboard/cleaner" className="text-[13px] font-medium text-[#19706A] hover:underline whitespace-nowrap shrink-0">
              {t('backToDashboard')}
            </Link>
          </div>
        ) : (
          <nav className="flex items-center gap-1.5 text-[12px] text-[#5B7472] dark:text-[#9BB0AE] mb-5">
            <Link href="/" className="text-[#19706A] hover:underline">{t('breadcrumbHome')}</Link>
            <span>›</span>
            <Link href="/cleaners" className="text-[#19706A] hover:underline">{t('breadcrumbFind')}</Link>
            <span>›</span>
            <span>{cleaner.display_name}</span>
          </nav>
        )}

        {/* Profile top row — stacks on mobile (avatar, then name/meta, then rate/CTA) since
            the fixed horizontal row squeezed all three into overlapping, wrapped-to-uselessness
            content below ~640px */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            {cleaner.photo_url ? (
              <LoadingImage
                src={cleaner.photo_url}
                alt={cleaner.display_name}
                wrapperClassName="w-[88px] h-[88px] rounded-full border-[3px] border-white shadow-[0_2px_8px_rgba(25,112,106,0.15)]"
                className="object-cover"
              />
            ) : (
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
            )}
            {cleaner.verified && (
              <div className="absolute -bottom-1 -right-1 flex items-center gap-1 bg-[#19706A] rounded-full px-2 py-0.5 border-[2px] border-white">
                <span className="w-1 h-1 rounded-full bg-white dark:bg-[#16211F] shrink-0" />
                <span className="text-[9px] font-medium text-white">{verifiedLabel}</span>
              </div>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-[26px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{cleaner.display_name}</h1>
              {!isOwnProfile && role !== 'CLEANER' && role !== 'ADMIN' && (
                <button
                  type="button"
                  onClick={toggleFavorite}
                  aria-label={favorited ? t('unfavorite') : t('favorite')}
                  aria-pressed={favorited}
                  className="w-8 h-8 rounded-full border border-[#E0EDEC] dark:border-[#253634] flex items-center justify-center hover:border-[#D64545] transition-colors shrink-0"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={favorited ? '#D64545' : 'none'} stroke={favorited ? '#D64545' : '#5B7472'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                  </svg>
                </button>
              )}
              {cleaner.cities.map(city => (
                <span key={city} className="bg-[#E6F1FF] dark:bg-[#122A42] text-[#2D8CFF] rounded-[6px] px-2.5 py-0.5 text-[12px] font-medium">{getCityName(city)}</span>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4 sm:items-center sm:flex-wrap text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-3">
              <button
                onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity cursor-pointer group"
              >
                <StarRow rating={cleaner.avg_rating} />
                <span className="group-hover:text-[#19706A] transition-colors group-hover:underline underline-offset-2">
                  {cleaner.avg_rating} · {t('reviewsCount', { count: cleaner.review_count })}
                </span>
              </button>
              <span className="hidden sm:inline">·</span>
              <span>{t('jobsDone', { count: cleaner.total_jobs_count })}</span>
              <span className="hidden sm:inline">·</span>
              <span>{t('uniqueCustomers', { count: uniqueCustomers })}</span>
              {tenureLabel && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{tenureLabel}</span>
                </>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <span className="bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                {cleaner.languages.join(' · ')}
              </span>
              <span className="bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                {cleanerTypeLabel}
              </span>
            </div>
          </div>

          {/* Rate + CTA — a horizontal bar on mobile (price left, button right), the
              original right-aligned stack from sm: up */}
          <div className="flex flex-row items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
            <div className="sm:text-right">
              <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">{t('hourlyRate')}</p>
              <p className="text-[20px] sm:text-[26px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] leading-none">
                €{cleaner.hourly_rate_eur}<span className="text-[14px] text-[#5B7472] dark:text-[#9BB0AE] font-normal">{tCommon('perHour')}</span>
              </p>
            </div>
            {isOwnProfile ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="btn-primary rounded-full px-6 py-3 text-[14px] whitespace-nowrap opacity-40 cursor-not-allowed"
              >
                {bookLabel} →
              </button>
            ) : (
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={handleBookClick}
                  disabled={creatingThread}
                  className="btn-primary rounded-full px-6 py-3 text-[14px] whitespace-nowrap disabled:opacity-60"
                >
                  {bookLabel} →
                </button>
                <button
                  onClick={handleIntroClick}
                  disabled={creatingThread}
                  className="text-[12px] font-medium text-[#19706A] hover:underline disabled:opacity-60"
                >
                  {threadId ? t('openChat') : messageLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body: left + right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-4 sm:px-10 py-7">
        {/* Left column */}
        <div>
          {/* About */}
          <div className="bg-white dark:bg-[#16211F] border border-[#E0EDEC] dark:border-[#253634] rounded-[16px] p-6 mb-4">
            <h2 className="text-[15px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-3">{t('about', { name: firstName })}</h2>
            <p className="text-[14px] text-[#5B7472] dark:text-[#9BB0AE] leading-relaxed">{cleaner.bio}</p>
          </div>

          {/* Reviews */}
          <div id="reviews" className="bg-white dark:bg-[#16211F] border border-[#E0EDEC] dark:border-[#253634] rounded-[16px] p-6">
            <h2 className="text-[15px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1">
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
          <div className="sticky top-6 bg-white dark:bg-[#16211F] border border-[#E0EDEC] dark:border-[#253634] rounded-[16px] p-6">
            <div className="mb-1">
              <span className="text-[28px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">€{cleaner.hourly_rate_eur}</span>
              <span className="text-[14px] text-[#5B7472] dark:text-[#9BB0AE]">{tCommon('perHour')}</span>
            </div>
            <button
              onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-1.5 text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-5 hover:opacity-70 transition-opacity cursor-pointer group"
            >
              <StarRow rating={cleaner.avg_rating} />
              <span className="group-hover:text-[#19706A] transition-colors">{cleaner.avg_rating} · {cleaner.review_count} reviews</span>
            </button>

            <div className="border-t border-[#E0EDEC] dark:border-[#253634] my-4" />

            <div className="space-y-2.5 mb-4">
              {[
                { label: t('languages'), value: cleaner.languages.join(', ') },
                { label: t('city'), value: cleaner.cities.map(getCityName).join(', ') },
                { label: t('type'), value: cleanerTypeLabel },
                { label: t('availability'), value: availabilityLabel },
                ...(cleaner.has_transport ? [{ label: t('transport'), value: t('hasOwnTransport') }] : []),
              ].map(row => (
                <div key={row.label} className="flex justify-between text-[13px]">
                  <span className="text-[#5B7472] dark:text-[#9BB0AE]">{row.label}</span>
                  <span className="text-[#0D1F1E] dark:text-[#ECF3F2] font-medium text-right ml-4">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#E0EDEC] dark:border-[#253634] my-4" />

            {isOwnProfile ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="btn-primary w-full rounded-full py-3 text-[14px] opacity-40 cursor-not-allowed"
              >
                {bookLabel} →
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleBookClick}
                  disabled={creatingThread}
                  className="btn-primary w-full rounded-full py-3 text-[14px] disabled:opacity-60"
                >
                  {bookLabel} →
                </button>
                <button
                  onClick={handleIntroClick}
                  disabled={creatingThread}
                  className="btn-ghost w-full rounded-full py-3 text-[14px] disabled:opacity-60"
                >
                  {threadId ? t('openChat') : messageLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {cleanerToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-[#0D1F1E] dark:bg-[#ECF3F2] text-white text-[13px] px-5 py-3 rounded-full shadow-lg whitespace-nowrap">
          {t('cleanerCannotIntro')}
        </div>
      )}
      {chatError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-[#0D1F1E] dark:bg-[#ECF3F2] text-white text-[13px] px-5 py-3 rounded-full shadow-lg whitespace-nowrap">
          {t('startChatError')}
        </div>
      )}
      {threadId && (
        <ChatModal
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          introductionId={threadId}
          currentUserId={session!.user.id}
          currentUserRole="CUSTOMER"
          otherPartyName={cleaner.display_name}
          otherPartyAvatar={cleaner.photo_url ?? null}
          hourlyRateEur={cleaner.hourly_rate_eur}
          bookingFeeEur={cleaner.booking_fee_eur ?? null}
          offerings={cleaner.offerings ?? null}
          initialShowBookingForm={wantsBookingForm}
        />
      )}
    </div>
  )
}
