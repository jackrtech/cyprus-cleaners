'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { extractErrorMessage } from '@/lib/utils'
import { compressImage } from '@/lib/utils/compressImage'
import LoadingImage from '@/components/ui/LoadingImage'

interface Message {
  id:                string
  support_thread_id: string
  sender_id:         string
  body:              string | null
  photo_path:        string | null
  photo_url:         string | null
  read_at:           string | null
  created_at:        string
}

const PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

interface Props {
  threadId:       string
  currentUserId:  string
  otherPartyName: string
  onClose:        () => void
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Trimmed sibling of ChatPanel — same message-list/input/Realtime shape,
// but for a support_thread_id instead of an introduction_id, and without
// any of the booking-request UI a customer<->cleaner thread needs (a
// support conversation is just messages, there's no booking to nudge).
export default function SupportChatPanel({ threadId, currentUserId, otherPartyName, onClose }: Props) {
  const t      = useTranslations('chat')
  const locale = useLocale()

  const [messages, setMessages] = useState<Message[] | null>(null)
  const [draft,      setDraft]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [sendFailed, setSendFailed] = useState<string | null>(null)

  const [photoFile,    setPhotoFile]    = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError,   setPhotoError]   = useState<string | null>(null)

  const messageListRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/messages?support_thread_id=${threadId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Message[]) => { if (!cancelled) setMessages(data) })
      .catch(() => { if (!cancelled) setMessages([]) })
    return () => { cancelled = true }
  }, [threadId])

  // Realtime — same pattern as ChatPanel: RLS needs a Supabase-compatible
  // token minted from the NextAuth session (see /api/supabase-token).
  useEffect(() => {
    let cancelled = false
    let supabase: SupabaseClient | null = null
    let channel: RealtimeChannel | null = null

    async function connect() {
      const res = await fetch('/api/supabase-token')
      if (!res.ok || cancelled) return
      const { token } = (await res.json()) as { token: string }
      if (cancelled) return

      supabase = createClient(token)
      supabase.realtime.setAuth(token)

      channel = supabase
        .channel(`support-chat:${threadId}`)
        .on('postgres_changes', {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `support_thread_id=eq.${threadId}`,
        }, (payload) => {
          const incoming = payload.new as Message
          setMessages(prev => {
            if (prev?.some(m => m.id === incoming.id)) return prev
            return [...(prev ?? []), incoming]
          })
        })
        .subscribe()
    }

    connect()

    return () => {
      cancelled = true
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [threadId])

  const hasScrolledInitially = useRef(false)
  useEffect(() => {
    const el = messageListRef.current
    if (!el) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isInitialLoad = messages !== null && !hasScrolledInitially.current
    el.scrollTo({ top: el.scrollHeight, behavior: (isInitialLoad || reduceMotion) ? 'auto' : 'smooth' })
    if (messages !== null) hasScrolledInitially.current = true
  }, [messages])

  function handlePhotoInMessageLoad() {
    const el = messageListRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 300) {
      el.scrollTop = el.scrollHeight
    }
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }, [draft])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value.slice(0, 2000))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSend() {
    const trimmed = draft.trim()
    if ((!trimmed && !photoFile) || sending) return

    const pendingFile = photoFile

    setDraft('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setSendFailed(null)
    setSending(true)
    try {
      let res: Response
      if (pendingFile) {
        const formData = new FormData()
        formData.append('support_thread_id', threadId)
        formData.append('body', trimmed)
        formData.append('photo', pendingFile)
        res = await fetch('/api/messages', { method: 'POST', body: formData })
      } else {
        res = await fetch('/api/messages', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ support_thread_id: threadId, body: trimmed }),
        })
      }
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('sendError')))

      const newMessage: Message = await res.json()
      setMessages(prev => {
        if (prev?.some(m => m.id === newMessage.id)) return prev
        return [...(prev ?? []), newMessage]
      })
    } catch (err) {
      setSendFailed(err instanceof Error ? err.message : t('sendError'))
    } finally {
      setSending(false)
    }
  }

  function handlePhotoButtonClick() {
    fileInputRef.current?.click()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPhotoError(null)
    if (!PHOTO_ALLOWED_TYPES.has(file.type)) {
      setPhotoError(t('photoInvalidType'))
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError(t('photoTooLarge'))
      return
    }
    const compressed = await compressImage(file)
    setPhotoFile(compressed)
    setPhotoPreview(URL.createObjectURL(compressed))
  }

  function handleRemovePhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    setPhotoError(null)
  }

  return (
    <div className="flex flex-col max-md:h-full">
      <div className="border-b border-[#E0EDEC] dark:border-[#253634]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[12px] font-medium shrink-0">
              {getInitials(otherPartyName)}
            </div>
            <span className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">{otherPartyName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0 ml-2"
          >
            ×
          </button>
        </div>
      </div>

      <div ref={messageListRef} className="flex-1 min-h-0 md:flex-none md:max-h-[400px] overflow-y-auto px-4 py-4">
        {messages === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`h-9 rounded-2xl bg-[#E0EDEC] dark:bg-[#253634] animate-pulse ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[120px]">
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{t('noMessages')}</p>
          </div>
        ) : (
          messages.map(m => {
            const isMine = m.sender_id === currentUserId
            return (
              <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} mb-3`}>
                {m.photo_url && (
                  <a href={m.photo_url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                    <LoadingImage
                      src={m.photo_url}
                      onLoad={handlePhotoInMessageLoad}
                      wrapperClassName="w-[180px] h-[180px] rounded-[16px] border border-[#E0EDEC] dark:border-[#253634]"
                      className="object-cover"
                    />
                  </a>
                )}
                {m.body && (
                  <div
                    className={`max-w-[75%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                      isMine
                        ? 'bg-[#19706A] text-white rounded-[16px_16px_4px_16px]'
                        : 'bg-[#E6F1FF] dark:bg-[#122A42] text-[#0D1F1E] dark:text-[#ECF3F2] rounded-[16px_16px_16px_4px]'
                    }`}
                  >
                    {m.body}
                  </div>
                )}
                <span className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] mt-1 px-1">
                  {timeFormatter.format(new Date(m.created_at))}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-[#E0EDEC] dark:border-[#253634] p-3">
        {photoPreview && (
          <div className="flex items-center gap-2 mb-2">
            <img src={photoPreview} alt="" className="w-12 h-12 rounded-lg object-cover border border-[#E0EDEC] dark:border-[#253634]" />
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="text-[12px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-red-600 transition-colors"
            >
              {t('removePhoto')}
            </button>
          </div>
        )}
        {photoError && <p className="text-[12px] text-red-600 mb-2">{photoError}</p>}
        {sendFailed && <p className="text-[12px] text-red-600 mb-2">{sendFailed}</p>}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('inputPlaceholder')}
              rows={1}
              maxLength={2000}
              className="input w-full resize-none max-h-[96px]"
            />
            <div className="text-[11px] text-[#5B7472] dark:text-[#9BB0AE] text-right mt-1">
              {draft.length}/2000 {t('characters')}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={handlePhotoButtonClick}
            aria-label="Attach photo"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#19706A] hover:border-[#19706A] cursor-pointer transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11.5 6.5v4a3.5 3.5 0 0 1-7 0v-5a2.5 2.5 0 0 1 5 0v5a1.5 1.5 0 0 1-3 0v-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || (draft.trim().length === 0 && !photoFile)}
            aria-label="Send"
            className="btn-primary !px-0 w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 8h12M9 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
