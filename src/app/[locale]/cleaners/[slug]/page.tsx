'use client'

import { useState, useEffect } from 'react'
import { notFound } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Link, useRouter } from '@/navigation'
import type { MockCleaner } from '@/lib/mockCleaners'
import ReviewItem from '@/components/cleaners/ReviewItem'
import { useCity } from '@/hooks/useCity'
import ChatModal from '@/components/chat/ChatModal'
import Footer from '@/components/Footer'

interface DbCleanerRow {
  id:                    string
  slug:                  string
  display_name:          string
  bio:                   string | null
  photo_url:             string | null
  cover_photo_url:       string | null
  city:                  string | null
  cities:                string[] | null
  hourly_rate_eur:       number
  services:              ('HOUSE' | 'APARTMENT')[] | null
  languages:             string[] | null
  cleaner_type:          'individual' | 'company' | null
  gender:                'female' | 'male' | null
  verified:              boolean
  avg_rating:            number
  review_count:          number
  unique_customer_count: number
  total_jobs_count:      number
  availability:          Record<string, boolean> | null
  is_mock:               boolean
  is_company:            boolean
  is_own_profile:        boolean
}

interface DbReviewRow {
  id:                 string
  rating:             number
  body:               string
  body_translations:  Record<string, string> | null
  created_at:         string
  customer_id:        string | null
  is_mock:            boolean
  users:              { full_name: string } | null
}

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

function mapAvailability(raw: Record<string, boolean> | null): ('weekdays' | 'weekends' | 'evenings')[] {
  if (!raw) return []
  return (['weekdays', 'weekends', 'evenings'] as const).filter(key => raw[key])
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
    availability:           mapAvailability(row.availability),
    cleaner_type:           cleanerType,
    total_jobs_count:       row.total_jobs_count,
    unique_customer_count:  row.unique_customer_count,
    bio:                    row.bio ?? '',
    photo_url:              row.photo_url,
    cover_photo_url:        row.cover_photo_url,
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


export default function CleanerProfilePage({ params }: { params: { slug: string } }) {
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const tFilters = useTranslations('filters')
  const locale = useLocale()
  const getCityName = useCity()
  const { data: session } = useSession()
  const [threadId,       setThreadId]       = useState<string | null>(null)
  const [chatOpen,       setChatOpen]       = useState(false)
  const [creatingThread, setCreatingThread] = useState(false)
  const [cleanerToast,   setCleanerToast]   = useState(false)
  const [chatError,      setChatError]      = useState(false)
  const router = useRouter()

  const [cleaner,        setCleaner]       = useState<MockCleaner | null>(null)
  const [cleanerLoading, setCleanerLoading] = useState(true)
  const [cleanerError,   setCleanerError]   = useState(false)
  const [notFoundFlag,   setNotFoundFlag]   = useState(false)
  const [isOwnProfile,   setIsOwnProfile]   = useState(false)

  const [reviews,        setReviews]        = useState<ProfileReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/cleaners/${params.slug}`)
      .then(r => {
        if (r.status === 404) { setNotFoundFlag(true); return null }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((row: DbCleanerRow | null) => {
        if (row) {
          setCleaner(mapCleaner(row))
          setIsOwnProfile(row.is_own_profile)
        }
      })
      .catch(() => setCleanerError(true))
      .finally(() => setCleanerLoading(false))
  }, [params.slug])

  useEffect(() => {
    fetch(`/api/cleaners/${params.slug}/reviews`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((rows: DbReviewRow[]) => setReviews(rows.map(mapReview)))
      .catch(() => {})
      .finally(() => setReviewsLoading(false))
  }, [params.slug])

  // Check for an existing thread with this cleaner (CUSTOMER only) — purely
  // for button-label purposes ("Message" vs "Open chat"), never gates access.
  useEffect(() => {
    const userRole = (session?.user as { role?: string } | undefined)?.role
    if (!cleaner || !session || userRole !== 'CUSTOMER') {
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
  }, [cleaner, session])

  if (notFoundFlag) notFound()

  if (cleanerLoading) {
    return (
      <div className="min-h-screen bg-[#F7FAF9]">
        <div className="bg-white border-b border-[#E0EDEC] px-4 sm:px-10 py-6">
          <div className="h-4 w-40 bg-[#E0EDEC] rounded animate-pulse mb-5" />
          <div className="flex items-start gap-6">
            <div className="w-[88px] h-[88px] rounded-full bg-[#E0EDEC] animate-pulse shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-1/3 bg-[#E0EDEC] rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-[#E0EDEC] rounded animate-pulse" />
              <div className="h-4 w-1/4 bg-[#E0EDEC] rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-4 sm:px-10 py-7">
          <div className="bg-white border border-[#E0EDEC] rounded-[16px] p-6 h-[200px] animate-pulse" />
          <div className="bg-white border border-[#E0EDEC] rounded-[16px] p-6 h-[300px] animate-pulse" />
        </div>
      </div>
    )
  }

  if (cleanerError || !cleaner) {
    return (
      <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center px-4">
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
          Failed to load cleaner profile. Please refresh.
        </p>
      </div>
    )
  }

  const firstName = cleaner.display_name.split(' ')[0]
  const uniqueCustomers = cleaner.unique_customer_count

  // Auth-aware intro button
  const role = (session?.user as { role?: string } | undefined)?.role

  async function handleIntroClick() {
    if (!cleaner) return
    if (!session) {
      router.push(`/login?return=/cleaners/${cleaner.slug}`)
      return
    }
    if (role !== 'CUSTOMER') {
      setCleanerToast(true)
      setTimeout(() => setCleanerToast(false), 3000)
      return
    }
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

  // Gendered / locale-aware labels
  const messageLabel = locale === 'el'
    ? cleaner.gender === 'female'
      ? t('messageBtnFemale', { name: firstName })
      : cleaner.gender === 'male'
        ? t('messageBtnMale', { name: firstName })
        : t('messageBtnCompany', { name: firstName })
    : t('messageBtn', { name: firstName })

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

  const availabilityLabel = cleaner.availability
    .map(a => tFilters(a as 'weekdays' | 'weekends' | 'evenings'))
    .join(', ')

  return (
    <div className="min-h-screen bg-[#F7FAF9] pb-tabbar md:pb-0">
      {/* Cover photo — only shown once the cleaner has set one */}
      {cleaner.cover_photo_url && (
        <div className="h-32 sm:h-44 w-full">
          <img src={cleaner.cover_photo_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Page header */}
      <div className="bg-white border-b border-[#E0EDEC] px-4 sm:px-10 py-6">
        {/* Breadcrumb — replaced with a preview banner + one-tap exit when a
            cleaner is looking at their own public profile, so it reads as
            "previewing" rather than "I've wandered into the live site" */}
        {isOwnProfile ? (
          <div className="flex items-center justify-between gap-3 flex-wrap bg-[#E8F4F3] border border-[#19706A]/20 rounded-[10px] px-4 py-2.5 mb-5">
            <span className="text-[13px] text-[#19706A] font-medium">{t('previewingOwnProfile')}</span>
            <Link href="/dashboard/cleaner" className="text-[13px] font-medium text-[#19706A] hover:underline whitespace-nowrap shrink-0">
              {t('backToDashboard')}
            </Link>
          </div>
        ) : (
          <nav className="flex items-center gap-1.5 text-[12px] text-[#6B8886] mb-5">
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
              <img
                src={cleaner.photo_url}
                alt={cleaner.display_name}
                className="w-[88px] h-[88px] rounded-full object-cover border-[3px] border-white"
                style={{ boxShadow: '0 2px 8px rgba(25,112,106,0.15)' }}
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
                <span className="w-1 h-1 rounded-full bg-white shrink-0" />
                <span className="text-[9px] font-medium text-white">{verifiedLabel}</span>
              </div>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-[26px] font-medium text-[#0D1F1E]">{cleaner.display_name}</h1>
              {cleaner.cities.map(city => (
                <span key={city} className="bg-[#E6F1FF] text-[#2D8CFF] rounded-[6px] px-2.5 py-0.5 text-[12px] font-medium">{getCityName(city)}</span>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4 sm:items-center sm:flex-wrap text-[13px] text-[#6B8886] mb-3">
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
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <span className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                {cleaner.languages.join(' · ')}
              </span>
              <span className="bg-[#E8F4F3] text-[#19706A] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                {cleanerTypeLabel}
              </span>
            </div>
          </div>

          {/* Rate + CTA — a horizontal bar on mobile (price left, button right), the
              original right-aligned stack from sm: up */}
          <div className="flex flex-row items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
            <div className="sm:text-right">
              <p className="text-[12px] text-[#6B8886]">{t('hourlyRate')}</p>
              <p className="text-[20px] sm:text-[26px] font-medium text-[#0D1F1E] leading-none">
                €{cleaner.hourly_rate_eur}<span className="text-[14px] text-[#6B8886] font-normal">{tCommon('perHour')}</span>
              </p>
            </div>
            {isOwnProfile ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="btn-primary rounded-full px-6 py-3 text-[14px] whitespace-nowrap opacity-40 cursor-not-allowed"
              >
                {messageLabel} →
              </button>
            ) : (
              <button
                onClick={handleIntroClick}
                disabled={creatingThread}
                className="btn-primary rounded-full px-6 py-3 text-[14px] whitespace-nowrap disabled:opacity-60"
              >
                {threadId ? t('openChat') : messageLabel} →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body: left + right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-4 sm:px-10 py-7">
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
              {reviewsLoading ? (
                <div className="space-y-4 py-4">
                  {[1, 2].map(i => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-3 bg-[#F0F5F4] rounded animate-pulse w-1/4" />
                      <div className="h-3 bg-[#F0F5F4] rounded animate-pulse w-full" />
                      <div className="h-3 bg-[#F0F5F4] rounded animate-pulse w-3/5" />
                    </div>
                  ))}
                </div>
              ) : (
                reviews.map(review => (
                  <ReviewItem key={review.id} review={review} locale={locale} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column — sticky booking card */}
        <div>
          <div className="sticky top-6 bg-white border border-[#E0EDEC] rounded-[16px] p-6">
            <div className="mb-1">
              <span className="text-[28px] font-medium text-[#0D1F1E]">€{cleaner.hourly_rate_eur}</span>
              <span className="text-[14px] text-[#6B8886]">{tCommon('perHour')}</span>
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
                { label: t('city'), value: cleaner.cities.map(getCityName).join(', ') },
                { label: t('type'), value: cleanerTypeLabel },
                { label: t('availability'), value: availabilityLabel },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-[13px]">
                  <span className="text-[#6B8886]">{row.label}</span>
                  <span className="text-[#0D1F1E] font-medium text-right ml-4">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#E0EDEC] my-4" />

            {isOwnProfile ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="btn-primary w-full rounded-full py-3 text-[14px] opacity-40 cursor-not-allowed"
              >
                {messageLabel} →
              </button>
            ) : (
              <button
                onClick={handleIntroClick}
                disabled={creatingThread}
                className="btn-primary w-full rounded-full py-3 text-[14px] disabled:opacity-60"
              >
                {threadId ? t('openChat') : messageLabel} →
              </button>
            )}
          </div>
        </div>
      </div>
      {cleanerToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-[#0D1F1E] text-white text-[13px] px-5 py-3 rounded-full shadow-lg whitespace-nowrap">
          {t('cleanerCannotIntro')}
        </div>
      )}
      {chatError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-[#0D1F1E] text-white text-[13px] px-5 py-3 rounded-full shadow-lg whitespace-nowrap">
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
        />
      )}
      <Footer />
    </div>
  )
}
