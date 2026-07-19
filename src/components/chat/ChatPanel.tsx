'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id:               string
  introduction_id:  string
  sender_id:        string
  body:             string
  read_at:          string | null
  created_at:       string
}

interface ChatPanelProps {
  introductionId:    string
  currentUserId:     string
  otherPartyName:    string
  otherPartyAvatar:  string | null
  onClose?:          () => void
  onMessageSent?:    (message: Message) => void
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ChatPanel({
  introductionId, currentUserId, otherPartyName, otherPartyAvatar,
  onClose, onMessageSent,
}: ChatPanelProps) {
  const t      = useTranslations('chat')
  const locale = useLocale()

  const [messages, setMessages] = useState<Message[] | null>(null)
  const [draft,       setDraft]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendFailed,  setSendFailed]  = useState(false)

  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)

  const [showSecret, setShowSecret] = useState(false)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const animFrameRef  = useRef<number | null>(null)

  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    fetch(`/api/messages?introduction_id=${introductionId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Message[]) => { if (!cancelled) setMessages(data) })
      .catch(() => { if (!cancelled) setMessages([]) })
    return () => { cancelled = true }
  }, [introductionId])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`chat:${introductionId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `introduction_id=eq.${introductionId}`,
      }, (payload) => {
        const incoming = payload.new as Message
        setMessages(prev => {
          if (prev?.some(m => m.id === incoming.id)) return prev
          return [...(prev ?? []), incoming]
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [introductionId])

  // Auto-scroll to bottom on new messages / initial load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-expand textarea up to 4 rows
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }, [draft])

  // Secret overlay — canvas fireworks + synthetic sound, skipped under prefers-reduced-motion
  useEffect(() => {
    if (!showSecret) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    }
    const audioCtx = audioCtxRef.current!

    const colors = ['#ff0000', '#F2C94C', '#19706A', '#ffffff', '#ff69b4', '#ffa500']

    interface Particle { x: number; y: number; vx: number; vy: number; color: string; born: number }
    interface Rocket    { x: number; y: number; vy: number; targetY: number; color: string }

    let rockets: Rocket[]     = []
    let particles: Particle[] = []

    function playExplosionSound() {
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.3)
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      const source = audioCtx.createBufferSource()
      source.buffer = buffer

      const filter = audioCtx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 800

      const gain = audioCtx.createGain()
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(audioCtx.destination)

      source.start()
      source.stop(audioCtx.currentTime + 0.3)
    }

    function spawnFireworks() {
      for (let i = 0; i < 6; i++) {
        const x = Math.random() * canvas!.width
        const targetY = canvas!.height * 0.2 + Math.random() * canvas!.height * 0.3
        rockets.push({
          x,
          y: canvas!.height,
          vy: -(6 + Math.random() * 3),
          targetY,
          color: colors[Math.floor(Math.random() * colors.length)],
        })
      }
    }

    function explode(rocket: Rocket) {
      const count = 30 + Math.floor(Math.random() * 11)
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 1 + Math.random() * 4
        particles.push({
          x: rocket.x,
          y: rocket.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          born: performance.now(),
        })
      }
      playExplosionSound()
    }

    spawnFireworks()
    const intervalId = window.setInterval(spawnFireworks, 2500)

    function tick() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      rockets = rockets.filter(rocket => {
        rocket.y += rocket.vy
        ctx!.beginPath()
        ctx!.fillStyle = rocket.color
        ctx!.arc(rocket.x, rocket.y, 2, 0, Math.PI * 2)
        ctx!.fill()

        if (rocket.y <= rocket.targetY) {
          explode(rocket)
          return false
        }
        return true
      })

      const now = performance.now()
      particles = particles.filter(p => {
        const age = now - p.born
        if (age >= 1500) return false

        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05

        ctx!.beginPath()
        ctx!.fillStyle = p.color
        ctx!.globalAlpha = 1 - age / 1500
        ctx!.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.globalAlpha = 1

        return true
      })

      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
      window.clearInterval(intervalId)
    }
  }, [showSecret])

  function handleSecretClick() {
    setShowSecret(true)
  }

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
    if (!trimmed || sending) return

    setDraft('')
    setSendFailed(false)
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ introduction_id: introductionId, body: trimmed }),
      })
      if (!res.ok) throw new Error()

      const newMessage: Message = await res.json()
      setMessages(prev => {
        if (prev?.some(m => m.id === newMessage.id)) return prev
        return [...(prev ?? []), newMessage]
      })
      onMessageSent?.(newMessage)
    } catch {
      setSendFailed(true)
    } finally {
      setSending(false)
    }
  }

  function handlePhotoButtonClick() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoPreview(URL.createObjectURL(file))
  }

  return (
    <>
    <div className="flex flex-col bg-white border border-[#E0EDEC] rounded-[16px] overflow-hidden">

      {/* Header */}
      <div className="border-b border-[#E0EDEC]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {otherPartyAvatar ? (
              <img
                src={otherPartyAvatar}
                alt={otherPartyName}
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[12px] font-medium shrink-0">
                {getInitials(otherPartyName)}
              </div>
            )}
            <span className="text-[14px] font-medium text-[#0D1F1E] truncate">{otherPartyName}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-[#6B8886] hover:text-[#0D1F1E] transition-colors text-[20px] leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Message list */}
      <div className="max-h-[400px] overflow-y-auto px-4 py-4">
        {messages === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`h-9 rounded-2xl bg-[#E0EDEC] animate-pulse ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[120px]">
            <p className="text-[13px] text-[#6B8886]">{t('noMessages')}</p>
          </div>
        ) : (
          <>
            {messages.map(m => {
              const isMine = m.sender_id === currentUserId
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} mb-3`}>
                  <div
                    className={`max-w-[75%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                      isMine
                        ? 'bg-[#19706A] text-white rounded-[16px_16px_4px_16px]'
                        : 'bg-[#E6F1FF] text-[#0D1F1E] rounded-[16px_16px_16px_4px]'
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[11px] text-[#6B8886] mt-1 px-1">
                    {timeFormatter.format(new Date(m.created_at))}
                  </span>
                </div>
              )
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#E0EDEC] p-3">
        {photoPreview && (
          <div className="flex items-center gap-2 mb-2">
            <img src={photoPreview} alt="" className="w-12 h-12 rounded-lg object-cover border border-[#E0EDEC]" />
            <p className="text-[11px] text-[#6B8886]">{t('photoComingSoon')}</p>
          </div>
        )}
        {sendFailed && (
          <p className="text-[12px] text-red-600 mb-2">{t('sendError')}</p>
        )}
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
            <div className="text-[11px] text-[#6B8886] text-right mt-1">
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
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-[#E0EDEC] text-[#6B8886] hover:text-[#19706A] hover:border-[#19706A] cursor-pointer transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11.5 6.5v4a3.5 3.5 0 0 1-7 0v-5a2.5 2.5 0 0 1 5 0v5a1.5 1.5 0 0 1-3 0v-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleSecretClick}
            aria-label="?"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-[#E0EDEC] text-[#6B8886] cursor-pointer transition-colors"
          >
            ?
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || draft.trim().length === 0}
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

    {showSecret && (
      <div
        className="fixed inset-0 z-[500] flex flex-col items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
        onClick={() => setShowSecret(false)}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <div className="relative flex flex-col items-center pointer-events-none">
          <span className="secret-heart" style={{ fontSize: '6rem', lineHeight: 1 }}>❤️</span>
          <p className="secret-text text-white font-bold text-center mt-4" style={{ fontSize: '2.5rem' }}>
            I LOVE YOU MY DEAREST SASHA
          </p>
        </div>
      </div>
    )}

    <style jsx>{`
      @keyframes secretPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
      @keyframes secretFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .secret-heart {
        display: inline-block;
        animation: secretPulse 0.8s ease-in-out infinite;
      }
      .secret-text {
        opacity: 0;
        animation: secretFadeIn 0.3s ease-in forwards;
        animation-delay: 0.3s;
      }
      @media (prefers-reduced-motion: reduce) {
        .secret-heart {
          animation: none;
        }
        .secret-text {
          animation: none;
          opacity: 1;
        }
      }
    `}</style>
    </>
  )
}
