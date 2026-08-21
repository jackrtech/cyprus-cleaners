'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { createClient } from '@/lib/supabase/client'
import { extractErrorMessage, groupBookingsByPriority } from '@/lib/utils'
import { isAvailabilitySet, type WeeklyAvailability } from '@/lib/availability'
import { useCleanerBookingActions } from '@/hooks/useCleanerBookingActions'
import CleanerBookingCard from '@/components/dashboard/CleanerBookingCard'
import BookingDetailModal from '@/components/dashboard/BookingDetailModal'

interface CleanerProfile {
  id:        string
  slug:      string
  referral_code: string | null
  bio:       string | null
  photo_url: string | null
  cities:    string[] | null
  availability:         WeeklyAvailability | null
  verified:             boolean
  verification_status:  'PENDING' | 'APPROVED' | 'REJECTED' | null
  verification_note:    string | null
  earned_badge_keys:    string[]
}

// Home, added 2026-08-21 (Todoist "cleaner dashboard IA refactor") --
// replaces the old single /dashboard/cleaner page that Home and Bookings
// both aliased to (same content, since the old activeTab only had
// 'bookings'/'messages' states and Home's bare URL fell through to the
// 'bookings' default). This is now a genuinely distinct view:
// notifications/banners + upcoming-only bookings (no history). Full
// bookings incl. history live at /dashboard/cleaner/bookings; messaging at
// /dashboard/cleaner/messages -- neither shows any banner below.
export default function CleanerHomePage() {
  const { data: session, status: sessionStatus } = useSession()
  const t        = useTranslations('dashboard')
  const tAuth    = useTranslations('auth')
  const tBooking = useTranslations('booking')
  const tDisputes = useTranslations('disputes')

  const [profile, setProfile] = useState<CleanerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null)
  const actions = useCleanerBookingActions()

  const [idVerifyOpen,       setIdVerifyOpen]       = useState(false)
  const [referralCopied,     setReferralCopied]     = useState(false)
  // Feature-detected client-side only (added 2026-08-21, Todoist "native
  // share sheet") -- `navigator` doesn't exist during SSR, so this starts
  // false on every render (server and first client paint alike, avoiding a
  // hydration mismatch) and flips true post-mount wherever the Web Share API
  // is actually available: mobile Safari/Chrome, and some newer desktop
  // Chromium builds too -- feature-detection, not a manual mobile/desktop
  // split, so it just works better wherever the platform supports it.
  const [canNativeShare,     setCanNativeShare]     = useState(false)
  const [idVerifyFile,       setIdVerifyFile]       = useState<File | null>(null)
  const [selfieVerifyFile,   setSelfieVerifyFile]   = useState<File | null>(null)
  const [idVerifySubmitting, setIdVerifySubmitting] = useState(false)
  const [idVerifyError,      setIdVerifyError]      = useState<string | null>(null)

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [openDisputeCount, setOpenDisputeCount] = useState(0)
  const [earningsSummary, setEarningsSummary] = useState<{
    payoutsEnabled: boolean
    owedEur: number
  } | null>(null)
  const [resending,     setResending]     = useState(false)
  const [resendResult,  setResendResult]  = useState<'sent' | 'rate_limited' | null>(null)

  // Web Share API feature-detection (see canNativeShare's own comment above)
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  // Fetch email verification status
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    fetch('/api/user/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEmailVerified(d.email_verified ?? null) })
      .catch(() => {})
  }, [sessionStatus])

  // Fetch open disputes needing a response, for the dashboard banner
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    fetch('/api/cleaner/disputes')
      .then(r => r.ok ? r.json() : [])
      .then((data: { status: string; cleaner_response: string | null }[]) => {
        if (Array.isArray(data)) {
          setOpenDisputeCount(data.filter(d => d.status === 'OPEN' && !d.cleaner_response).length)
        }
      })
      .catch(() => {})
  }, [sessionStatus])

  // Fetch payout status, for the earnings banner below — shown when setup
  // is still needed or there's a balance worth knowing about, not on every
  // load regardless of state.
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    fetch('/api/cleaner-profiles/me/earnings')
      .then(r => r.ok ? r.json() : null)
      .then((data: { connect: { payouts_enabled: boolean }; summary: { held_eur: number; blocked_eur: number } } | null) => {
        if (data) {
          setEarningsSummary({
            payoutsEnabled: data.connect.payouts_enabled,
            owedEur:        data.summary.held_eur + data.summary.blocked_eur,
          })
        }
      })
      .catch(() => {})
  }, [sessionStatus])

  // Profile (incl. earned_badge_keys, for the invite-a-cleaner card's gate)
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return
    fetch('/api/cleaner-profiles/me')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data: CleanerProfile) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  // Added 2026-08-21 (Todoist "native share sheet"). Web Share API first
  // (native OS share sheet -- WhatsApp, Messages, Telegram, email, etc. --
  // no installed app required); falls back to the pre-existing
  // copy-to-clipboard behavior wherever navigator.share isn't available, or
  // if the share call itself fails for a reason other than the user simply
  // cancelling (AbortError -- that's a deliberate no-op, not a failure to
  // recover from).
  async function handleReferralShare() {
    const link = `${window.location.origin}/get-started?ref=${profile!.referral_code}`
    if (canNativeShare) {
      try {
        await navigator.share({ title: t('referralShareSubject'), text: t('referralShareText'), url: link })
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        // Fall through to the clipboard fallback below on any other failure.
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) -- no fallback
      // needed, the link is still visible below to select and copy by hand.
    }
  }

  async function handleResendVerification() {
    setResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      if (res.status === 429) setResendResult('rate_limited')
      else if (res.ok) setResendResult('sent')
    } catch {
      // ignore
    } finally {
      setResending(false)
    }
  }

  async function handleIdVerifySubmit() {
    if (!idVerifyFile || !selfieVerifyFile || idVerifySubmitting) return
    setIdVerifySubmitting(true)
    setIdVerifyError(null)
    try {
      const prepRes = await fetch('/api/cleaner-profiles/id-upload', { method: 'POST' })
      if (!prepRes.ok) throw new Error(await extractErrorMessage(prepRes, t('verificationUploadError')))
      const { idUpload, selfieUpload } = await prepRes.json()

      // Uploaded straight to the private bucket via the signed URLs above —
      // never through this app's own server.
      const storage = createClient().storage.from('id-documents')
      const [idResult, selfieResult] = await Promise.all([
        storage.uploadToSignedUrl(idUpload.path, idUpload.token, idVerifyFile),
        storage.uploadToSignedUrl(selfieUpload.path, selfieUpload.token, selfieVerifyFile),
      ])
      if (idResult.error || selfieResult.error) {
        throw new Error(t('verificationUploadError'))
      }

      const confirmRes = await fetch('/api/cleaner-profiles/id-upload/confirm', { method: 'POST' })
      if (!confirmRes.ok) throw new Error(await extractErrorMessage(confirmRes, t('verificationUploadError')))

      setProfile(prev => prev ? { ...prev, verification_status: 'PENDING', verification_note: null } : prev)
      setIdVerifyOpen(false)
      setIdVerifyFile(null)
      setSelfieVerifyFile(null)
    } catch (err) {
      setIdVerifyError(err instanceof Error ? err.message : t('verificationUploadError'))
    } finally {
      setIdVerifySubmitting(false)
    }
  }

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const profileIncomplete =
    !profile?.bio || !profile?.photo_url || !profile?.cities || profile.cities.length === 0 ||
    !isAvailabilitySet(profile?.availability)

  const bookingGroups = groupBookingsByPriority(actions.bookings)
  const showReferralCard = !!profile?.referral_code && !(profile?.earned_badge_keys ?? []).includes('referred_friend')

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto space-y-8">

        {/* Email verification banner */}
        {emailVerified === false && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] dark:bg-[#332B0F] border-l-4 border-[#F2C94C] rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tAuth('verifyEmailBanner')}</p>
            {resendResult === 'sent' ? (
              <span className="text-[13px] text-[#19706A] shrink-0">{tAuth('emailSent')}</span>
            ) : resendResult === 'rate_limited' ? (
              <span className="text-[13px] text-red-600 shrink-0">{tAuth('pleaseWait')}</span>
            ) : (
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full disabled:opacity-50"
              >
                {tAuth('resendEmail')}
              </button>
            )}
          </div>
        )}

        {/* Open disputes banner */}
        {openDisputeCount > 0 && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-[#3D1414] border-l-4 border-red-400 rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#DC2626" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tDisputes('dashboardBanner', { count: openDisputeCount })}</p>
            <Link href="/dashboard/cleaner/disputes" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {tDisputes('respondLink')}
            </Link>
          </div>
        )}

        {/* New booking requests banner — REQUESTED bookings still get their
            full actionable cards on /dashboard/cleaner/bookings; this is
            just the notification, same visual pattern as the disputes
            banner above. */}
        {bookingGroups.requested.length > 0 && (
          <div className="flex items-center gap-3 bg-gold-50 dark:bg-[#332B0F] border-l-4 border-gold-400 rounded-lg p-4 mb-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#B8860B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#B8860B" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{tBooking('newRequestsBanner', { count: bookingGroups.requested.length })}</p>
            <Link href="/dashboard/cleaner/bookings" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {tBooking('viewRequestsLink')}
            </Link>
          </div>
        )}

        {/* Payout setup / balance banner — shown when setup is still needed,
            or there's a balance worth knowing about; silent once payouts are
            live and nothing's currently owed. */}
        {earningsSummary && (!earningsSummary.payoutsEnabled || earningsSummary.owedEur > 0) && (
          <div className="flex items-center gap-3 bg-[#F7FAF9] dark:bg-[#0F1817] border-l-4 border-[#19706A] rounded-lg p-4 mb-4 flex-wrap">
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">
              {!earningsSummary.payoutsEnabled
                ? t('payoutSetupBanner')
                : t('payoutOwedBanner', { amount: earningsSummary.owedEur.toFixed(2) })}
            </p>
            <Link href="/dashboard/cleaner/earnings" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {t('viewEarnings')}
            </Link>
          </div>
        )}

        {/* Profile completion banner */}
        {!loading && profileIncomplete && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] dark:bg-[#332B0F] border-l-4 border-[#F2C94C] rounded-lg px-5 py-4 flex-wrap">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2C94C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M9 1.5L1.5 15h15L9 1.5z" />
              <path d="M9 7.5v3" />
              <circle cx="9" cy="13" r="0.75" fill="#F2C94C" stroke="none" />
            </svg>
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{t('completeProfileBanner')}</p>
            <Link href="/dashboard/cleaner/edit" className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full">
              {t('editProfile')}
            </Link>
          </div>
        )}

        {/* Verification status — PENDING/REJECTED/never-submitted. Nothing
            shown once verified (the blue tick on the public profile speaks
            for itself). */}
        {!loading && profile?.verification_status === 'PENDING' && (
          <div className="flex items-center gap-3 bg-[#FDF8E1] dark:bg-[#332B0F] border-l-4 border-[#F2C94C] rounded-lg px-5 py-4 flex-wrap">
            <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">{t('verificationPendingBanner')}</p>
          </div>
        )}

        {!loading && !profile?.verified && (profile?.verification_status === 'REJECTED' || !profile?.verification_status) && (
          <div className={`rounded-lg px-5 py-4 border-l-4 ${profile?.verification_status === 'REJECTED' ? 'bg-red-50 dark:bg-[#3D1414] border-red-400' : 'bg-[#F7FAF9] dark:bg-[#0F1817] border-[#E0EDEC] dark:border-[#253634]'}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] flex-1">
                {profile?.verification_status === 'REJECTED'
                  ? t('verificationRejectedBanner', { reason: profile.verification_note || t('verificationNoReason') })
                  : t('verificationPromptBanner')}
              </p>
              {!idVerifyOpen && (
                <button
                  onClick={() => setIdVerifyOpen(true)}
                  className="btn-primary shrink-0 text-[13px] px-4 py-2 rounded-full"
                >
                  {profile?.verification_status === 'REJECTED' ? t('verificationResubmitCta') : t('verificationUploadCta')}
                </button>
              )}
            </div>

            {idVerifyOpen && (
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="cleaner-verification-id" className="label block mb-1">{t('verificationIdLabel')}</label>
                  <input
                    id="cleaner-verification-id"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => setIdVerifyFile(e.target.files?.[0] ?? null)}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="cleaner-verification-selfie" className="label block mb-1">{t('verificationSelfieLabel')}</label>
                  <input
                    id="cleaner-verification-selfie"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => setSelfieVerifyFile(e.target.files?.[0] ?? null)}
                    className="input"
                  />
                </div>
                {idVerifyError && <p className="text-[13px] text-red-600">{idVerifyError}</p>}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleIdVerifySubmit}
                    disabled={!idVerifyFile || !selfieVerifyFile || idVerifySubmitting}
                    className="btn-primary text-[13px] px-4 py-2 rounded-full disabled:opacity-50"
                  >
                    {idVerifySubmitting ? t('verificationSubmitting') : t('verificationSubmit')}
                  </button>
                  <button
                    onClick={() => { setIdVerifyOpen(false); setIdVerifyError(null) }}
                    disabled={idVerifySubmitting}
                    className="btn-ghost text-[13px] px-4 py-2 rounded-full"
                  >
                    {t('verificationCancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Page heading */}
        {session?.user?.name && (
          <h1 className="text-[24px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-8">
            {t('welcomeBack', { name: session.user.name })}
          </h1>
        )}

        {/* Referral link — disappears once the referred_friend badge is
            earned (2026-08-21 fix; previously showed forever once a
            referral code existed, which is always, post-backfill). */}
        {showReferralCard && (
          <div className="card p-4 flex items-center gap-3 flex-wrap mb-6">
            <div className="flex-1 min-w-[220px]">
              <p className="text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-0.5">{t('referralTitle')}</p>
              <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">{t('referralSubtitle')}</p>
            </div>
            <button
              type="button"
              onClick={handleReferralShare}
              className="btn-secondary shrink-0 text-[13px] px-4 py-2 rounded-full"
            >
              {referralCopied ? t('referralCopied') : canNativeShare ? t('referralShareLink') : t('referralCopyLink')}
            </button>
          </div>
        )}

        {/* Upcoming bookings — soonest first, no history (see
            /dashboard/cleaner/bookings for the full list). */}
        {actions.bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="card p-5 h-[80px] animate-pulse" />
            ))}
          </div>
        ) : bookingGroups.confirmed.length === 0 ? (
          <div className="card p-8 flex flex-col items-center text-center gap-2">
            <p className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{tBooking('noUpcomingBookings')}</p>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{tBooking('noUpcomingBookingsBody')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.bookingActionError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {actions.bookingActionError}
              </p>
            )}
            {bookingGroups.confirmed.map(b => (
              <CleanerBookingCard key={b.id} booking={b} myProfileId={profile?.id} actions={actions} onOpenDetail={setViewingBookingId} />
            ))}
            {actions.photoUploadError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {actions.photoUploadError}
              </p>
            )}
            <input
              ref={actions.photoInputRef}
              type="file"
              accept="image/*"
              onChange={actions.handlePhotoFileSelect}
              className="hidden"
            />
          </div>
        )}
      </div>

      <BookingDetailModal
        isOpen={!!viewingBookingId}
        onClose={() => setViewingBookingId(null)}
        booking={(() => {
          const b = actions.bookings.find(b => b.id === viewingBookingId)
          if (!b) return null
          return {
            otherPartyName: b.users?.full_name ?? '—',
            status:         b.status,
            date:           b.date,
            start_time:     b.start_time,
            duration_hours: b.duration_hours,
            bedrooms:       b.bedrooms,
            bathrooms:      b.bathrooms,
            cleaning_type:  b.cleaning_type,
            notes:          b.notes,
            address:        b.address,
            addressLat:     b.address_lat,
            addressLng:     b.address_lng,
            findingUsNotes: b.finding_us_notes,
            photo_urls:     b.photo_urls,
            cancellationReason: b.cancellation_reason,
          }
        })()}
      />
    </div>
  )
}
