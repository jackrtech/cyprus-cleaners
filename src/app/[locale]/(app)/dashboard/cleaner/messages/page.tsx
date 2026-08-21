'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import ChatPanel from '@/components/chat/ChatPanel'

interface IntroUser {
  full_name: string
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
  id:           string
  created_at:   string
  users:        IntroUser | null
  last_message: LastMessage | null
  has_unread:   boolean
}

interface IntroCardProps {
  intro:         Introduction
  tReceivedOn:   string
  previewText:   string
  dateFormatter: Intl.DateTimeFormat
  currentUserId: string
  isChatOpen:    boolean
  onToggleChat:  () => void
}

function IntroCard({
  intro, tReceivedOn, previewText, dateFormatter,
  currentUserId, isChatOpen, onToggleChat,
}: IntroCardProps) {
  const customerName = intro.users?.full_name ?? '—'

  return (
    <div className="card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <p className="text-[15px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{customerName}</p>
            </div>
            <p className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE]">
              {tReceivedOn} {dateFormatter.format(new Date(intro.created_at))}
            </p>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onToggleChat}
              className={`rounded-full px-4 py-2 text-[13px] ${
                isChatOpen ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {isChatOpen ? 'Close chat' : 'Open chat'}
            </button>
          </div>
        </div>

        {!isChatOpen && (
          <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] leading-relaxed line-clamp-2">{previewText}</p>
        )}
      </div>

      {isChatOpen && (
        // Full-screen takeover on mobile so the chat can't be accidentally
        // scrolled past — inline expansion (desktop behavior, kept via md:)
        // made it easy to scroll the chat out of view entirely on small screens.
        <div className="max-md:fixed max-md:inset-0 max-md:z-[300] max-md:bg-white dark:max-md:bg-[#16211F] max-md:flex max-md:flex-col">
          <ChatPanel
            embedded
            introductionId={intro.id}
            currentUserId={currentUserId}
            currentUserRole="CLEANER"
            otherPartyName={intro.users?.full_name ?? 'Customer'}
            otherPartyAvatar={null}
            onClose={onToggleChat}
          />
        </div>
      )}
    </div>
  )
}

// Real route, added 2026-08-21 (Todoist "cleaner dashboard IA refactor") --
// strictly messaging, no banners/welcome heading/invite card. Those used to
// leak in here too on the old single-page /dashboard/cleaner?tab=messages
// since the banners rendered unconditionally above the tab switch.
export default function CleanerMessagesPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t     = useTranslations('dashboard')
  const tBooking = useTranslations('booking')
  const tChat = useTranslations('chat')
  const locale = useLocale()

  const [intros,  setIntros]  = useState<Introduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [openChatId, setOpenChatId] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return
    fetch('/api/introductions')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setIntros(data) })
      .catch(() => setError('Failed to load messages. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

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
                <path d="M24 3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4l3 4 3-4h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" />
              </svg>
            </div>
            <div>
              <p className="text-[16px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1">{t('noIntroRequestsYet')}</p>
              <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{t('noIntroRequestsBody')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map(intro => (
              <IntroCard
                key={intro.id}
                intro={intro}
                tReceivedOn={t('receivedOn')}
                previewText={
                  intro.last_message?.system_event
                    ? tBooking(SYSTEM_EVENT_KEY[intro.last_message.system_event] ?? 'systemUnknown')
                    : intro.last_message?.body ?? tChat('photoMessage')
                }
                dateFormatter={dateFormatter}
                currentUserId={session.user.id}
                isChatOpen={openChatId === intro.id}
                onToggleChat={() => setOpenChatId(openChatId === intro.id ? null : intro.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
