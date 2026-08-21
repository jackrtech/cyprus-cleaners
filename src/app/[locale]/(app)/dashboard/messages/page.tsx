'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/navigation'
import ChatPanel from '@/components/chat/ChatPanel'

interface CleanerProfileRef {
  display_name:     string
  photo_url:        string | null
  cities:           string[] | null
  hourly_rate_eur?: number
  cleaner_service_offerings?: { code: string; price_eur: number }[] | null
}

interface LastMessage {
  body:         string | null
  photo_path:   string | null
  system_event: string | null
  created_at:   string
}

const SYSTEM_EVENT_KEY: Record<string, string> = {
  REQUESTED: 'systemRequested',
  CONFIRMED: 'systemConfirmed',
  DECLINED:  'systemDeclined',
  CANCELLED: 'systemCancelled',
  COMPLETED: 'systemCompleted',
}

interface Introduction {
  id:               string
  created_at:       string
  cleaner_profiles: CleanerProfileRef | null
  last_message:     LastMessage | null
  has_unread:       boolean
  booking_fee_eur:  number
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Real route, added 2026-08-21 (Todoist "cleaner dashboard IA refactor",
// same treatment applied to the customer side) -- strictly messaging, no
// banners/welcome heading. `?open=<introductionId>` lets "Book again" (on
// BookingDetailModal, from Home or Bookings) land here with the right
// thread already expanded, replacing the old same-page `?tab=messages` +
// setOpenChatId that worked because it never left the page.
export default function CustomerMessagesPage() {
  return (
    <Suspense fallback={null}>
      <CustomerMessagesPageInner />
    </Suspense>
  )
}

function CustomerMessagesPageInner() {
  const { data: session, status: sessionStatus } = useSession()
  const searchParams = useSearchParams()
  const t        = useTranslations('dashboard')
  const tBooking = useTranslations('booking')
  const tChat    = useTranslations('chat')
  const locale   = useLocale()

  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [openChatId, setOpenChatId] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CUSTOMER') return
    fetch('/api/introductions')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setIntros(data) })
      .catch(() => setError('Failed to load messages. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  // Auto-open the thread named by ?open=, once intros have loaded.
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && intros.some(i => i.id === openId)) setOpenChatId(openId)
  }, [searchParams, intros])

  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const threads = intros.filter(i => i.last_message !== null)

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8">
      <div className="max-w-[720px] mx-auto space-y-8">
        <h1 className="text-[24px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{t('messagesTab')}</h1>

        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-5 h-[100px] animate-pulse" />
            ))}
          </div>
        ) : threads.length === 0 && !error ? (
          <div className="card p-10 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-[#E8F4F3] dark:bg-[#17302D] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12L14 3l10 9v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
                <path d="M10 24V16h8v8" />
              </svg>
            </div>
            <div>
              <p className="text-[16px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1">{t('noIntrosYet')}</p>
              <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{t('noIntrosBody')}</p>
            </div>
            <Link href="/dashboard/search" className="btn-primary">{t('findACleaner')}</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map(intro => {
              const cp        = intro.cleaner_profiles
              const name      = cp?.display_name ?? '—'
              const initials  = getInitials(name)
              const isChatOpen = openChatId === intro.id
              const previewText = intro.last_message?.system_event
                ? tBooking(SYSTEM_EVENT_KEY[intro.last_message.system_event] ?? 'systemUnknown')
                : intro.last_message?.body ?? tChat('photoMessage')

              return (
                <div key={intro.id} className="card overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-10 h-10 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[13px] font-medium overflow-hidden">
                          {cp?.photo_url
                            ? <img src={cp.photo_url} alt={name} className="w-full h-full object-cover" />
                            : initials
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">{name}</p>
                          <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
                            {t('sentOn')} {dateFormatter.format(new Date(intro.created_at))}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenChatId(isChatOpen ? null : intro.id)}
                        className={`rounded-full px-4 py-2 text-[13px] shrink-0 ${
                          isChatOpen ? 'btn-secondary' : 'btn-ghost'
                        }`}
                      >
                        {isChatOpen ? 'Close chat' : 'Open chat'}
                      </button>
                    </div>

                    {cp?.cities && cp.cities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {cp.cities.map(city => (
                          <span key={city} className="inline-block bg-[#E6F1FF] dark:bg-[#122A42] text-[#2D8CFF] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
                            {city}
                          </span>
                        ))}
                      </div>
                    )}

                    {!isChatOpen && (
                      <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] line-clamp-2 mt-2">{previewText}</p>
                    )}
                  </div>

                  {isChatOpen && (
                    <div className="max-md:fixed max-md:inset-0 max-md:z-[300] max-md:bg-white dark:max-md:bg-[#16211F] max-md:flex max-md:flex-col">
                      <ChatPanel
                        embedded
                        introductionId={intro.id}
                        currentUserId={session.user.id}
                        currentUserRole="CUSTOMER"
                        otherPartyName={cp?.display_name ?? 'Cleaner'}
                        otherPartyAvatar={cp?.photo_url ?? null}
                        hourlyRateEur={cp?.hourly_rate_eur ?? null}
                        bookingFeeEur={intro.booking_fee_eur}
                        offerings={cp?.cleaner_service_offerings ?? null}
                        onClose={() => setOpenChatId(null)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
