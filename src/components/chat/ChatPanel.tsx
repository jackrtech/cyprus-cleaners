'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { extractErrorMessage, estimateCleaningHours } from '@/lib/utils'
import type { BookingStatus, CleaningType } from '@/types'

interface Message {
  id:               string
  introduction_id:  string
  sender_id:        string
  body:             string | null
  photo_path:       string | null
  photo_url:        string | null
  read_at:          string | null
  created_at:       string
}

const PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

interface Booking {
  id:              string
  status:          BookingStatus
  bedrooms:        number | null
  bathrooms:       number | null
  cleaning_type:   CleaningType | null
  date:            string
  start_time:      string
  duration_hours:  number | null
  notes:           string | null
  created_at:      string
  photo_paths:     string[]
  photo_urls:      string[]
}

const MIN_COMPLETION_PHOTOS = 4

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  REQUESTED: 'badge-gold',
  CONFIRMED: 'badge-teal',
  COMPLETED: 'badge-blue',
  CANCELLED: 'bg-red-50 text-red-600',
}

// Quarter-hour slots covering a typical working day, 07:00–20:00
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = []
  for (let minutes = 7 * 60; minutes <= 20 * 60; minutes += 15) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0')
    const m = String(minutes % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
  }
  return slots
})()

function hoursLeftToRespond(createdAt: string): number {
  const deadline = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / (60 * 60 * 1000)))
}

const BOOKING_STATUS_KEY: Record<BookingStatus, string> = {
  REQUESTED: 'statusRequested',
  CONFIRMED: 'statusConfirmed',
  COMPLETED: 'statusCompleted',
  CANCELLED: 'statusCancelled',
}

interface ChatPanelProps {
  introductionId:    string
  currentUserId:     string
  currentUserRole:   'CUSTOMER' | 'CLEANER'
  otherPartyName:    string
  otherPartyAvatar:  string | null
  onClose?:          () => void
  onMessageSent?:    (message: Message) => void
  // When true, renders without its own header/border/rounded box — for
  // nesting inside a parent card that already shows the name/status header
  // and provides its own close control.
  embedded?:         boolean
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ChatPanel({
  introductionId, currentUserId, currentUserRole, otherPartyName, otherPartyAvatar,
  onClose, onMessageSent, embedded = false,
}: ChatPanelProps) {
  const t        = useTranslations('chat')
  const tBooking = useTranslations('booking')
  const locale   = useLocale()

  const [messages, setMessages] = useState<Message[] | null>(null)
  const [draft,       setDraft]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendFailed,  setSendFailed]  = useState<string | null>(null)

  const [photoFile,    setPhotoFile]    = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError,   setPhotoError]   = useState<string | null>(null)

  const [bookings,         setBookings]         = useState<Booking[] | null>(null)
  const [showBookingForm,  setShowBookingForm]  = useState(false)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingActionPending, setBookingActionPending] = useState(false)
  const [bookingError,     setBookingError]     = useState<string | null>(null)

  const [bedrooms,       setBedrooms]       = useState('1')
  const [bathrooms,      setBathrooms]      = useState('1')
  const [cleaningType,   setCleaningType]   = useState<CleaningType>('STANDARD')
  const [bookingDate,    setBookingDate]    = useState('')
  const [startTime,      setStartTime]      = useState('')
  const [durationHours,  setDurationHours]  = useState(String(estimateCleaningHours(1, 1, 'STANDARD')))
  const [durationTouched, setDurationTouched] = useState(false)
  const [bookingNotes,   setBookingNotes]   = useState('')

  // Pre-fill the duration estimate as room count/type change, but stop
  // overwriting it once the customer has edited it themselves
  useEffect(() => {
    if (durationTouched) return
    setDurationHours(String(estimateCleaningHours(Number(bedrooms) || 0, Number(bathrooms) || 0, cleaningType)))
  }, [bedrooms, bathrooms, cleaningType, durationTouched])

  const [showHistory, setShowHistory] = useState(false)

  const latestBooking   = bookings && bookings.length > 0 ? bookings[0] : null
  const activeBooking   = latestBooking && (latestBooking.status === 'REQUESTED' || latestBooking.status === 'CONFIRMED') ? latestBooking : null
  const historyBookings = activeBooking ? (bookings ?? []).slice(1) : (bookings ?? [])
  const canRequestNew   = !activeBooking
  const todayStr        = new Date().toISOString().slice(0, 10)
  const bookingDateFmt  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  const messageListRef = useRef<HTMLDivElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const completionFileInputRef = useRef<HTMLInputElement>(null)

  const [completionPhotoUploading, setCompletionPhotoUploading] = useState(false)
  const [completionPhotoError,     setCompletionPhotoError]     = useState<string | null>(null)

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

  // Booking fetch
  useEffect(() => {
    let cancelled = false
    fetch(`/api/bookings?introduction_id=${introductionId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Booking[]) => { if (!cancelled) setBookings(data) })
      .catch(() => { if (!cancelled) setBookings([]) })
    return () => { cancelled = true }
  }, [introductionId])

  // Realtime subscription — RLS on `messages` requires auth.uid() to resolve,
  // which needs a Supabase-compatible access token (NextAuth sessions alone
  // don't provide one). See /api/supabase-token and lib/supabase/authToken.ts.
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
    }

    connect()

    return () => {
      cancelled = true
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [introductionId])

  // Auto-scroll to bottom on new messages / initial load — scoped to the
  // message list's own scroll container so it never drags the page/window.
  // The initial load jumps instantly (no visible scroll animation once the
  // fetch resolves); only messages arriving after that animate smoothly.
  const hasScrolledInitially = useRef(false)
  useEffect(() => {
    const el = messageListRef.current
    if (!el) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isInitialLoad = messages !== null && !hasScrolledInitially.current
    el.scrollTo({ top: el.scrollHeight, behavior: (isInitialLoad || reduceMotion) ? 'auto' : 'smooth' })
    if (messages !== null) hasScrolledInitially.current = true
  }, [messages])

  // Message photos load asynchronously and can grow the scroll container
  // after the effect above already ran, leaving the view short of the true
  // bottom. Re-snap once each image finishes loading — but only if the user
  // was already near the bottom, so scrolling up to browse old photos isn't
  // fought.
  function handlePhotoInMessageLoad() {
    const el = messageListRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 300) {
      el.scrollTop = el.scrollHeight
    }
  }

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
        formData.append('introduction_id', introductionId)
        formData.append('body', trimmed)
        formData.append('photo', pendingFile)
        res = await fetch('/api/messages', { method: 'POST', body: formData })
      } else {
        res = await fetch('/api/messages', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ introduction_id: introductionId, body: trimmed }),
        })
      }
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('sendError')))

      const newMessage: Message = await res.json()
      setMessages(prev => {
        if (prev?.some(m => m.id === newMessage.id)) return prev
        return [...(prev ?? []), newMessage]
      })
      onMessageSent?.(newMessage)
    } catch (err) {
      setSendFailed(err instanceof Error ? err.message : t('sendError'))
    } finally {
      setSending(false)
    }
  }

  function handlePhotoButtonClick() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
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
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function handleRemovePhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    setPhotoError(null)
  }

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!bookingDate || !startTime || bookingSubmitting) return

    setBookingSubmitting(true)
    setBookingError(null)
    try {
      const res = await fetch('/api/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introduction_id: introductionId,
          bedrooms:         Number(bedrooms),
          bathrooms:        Number(bathrooms),
          cleaning_type:    cleaningType,
          date:             bookingDate,
          start_time:       startTime,
          duration_hours:   Number(durationHours),
          notes:            bookingNotes.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('submitError')))

      const newBooking: Booking = await res.json()
      setBookings(prev => [{ ...newBooking, photo_urls: [] }, ...(prev ?? [])])
      setShowBookingForm(false)
      setBedrooms('1')
      setBathrooms('1')
      setCleaningType('STANDARD')
      setBookingDate('')
      setStartTime('')
      setDurationTouched(false)
      setBookingNotes('')
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : tBooking('submitError'))
    } finally {
      setBookingSubmitting(false)
    }
  }

  async function handleBookingAction(action: 'CONFIRM' | 'DECLINE' | 'CANCEL' | 'COMPLETE') {
    if (!activeBooking || bookingActionPending) return

    setBookingActionPending(true)
    setBookingError(null)
    try {
      const res = await fetch(`/api/bookings/${activeBooking.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))

      const updated: Booking = await res.json()
      setBookings(prev => {
        // The PATCH response doesn't re-sign photo URLs — carry the existing ones over
        const previousUrls = prev?.find(b => b.id === updated.id)?.photo_urls ?? []
        const merged = { ...updated, photo_urls: previousUrls }
        return [merged, ...(prev ?? []).filter(b => b.id !== updated.id)]
      })
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPending(false)
    }
  }

  async function handleCompletionPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeBooking || completionPhotoUploading) return

    setCompletionPhotoUploading(true)
    setCompletionPhotoError(null)
    try {
      const formData = new FormData()
      formData.append('photo', file)

      const res = await fetch(`/api/bookings/${activeBooking.id}/photos`, {
        method: 'POST',
        body:   formData,
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('photoUploadError')))

      const result: { photo_paths: string[]; new_photo_url: string | null } = await res.json()
      setBookings(prev => (prev ?? []).map(b => b.id !== activeBooking.id ? b : {
        ...b,
        photo_paths: result.photo_paths,
        photo_urls: result.new_photo_url ? [...b.photo_urls, result.new_photo_url] : b.photo_urls,
      }))
    } catch (err) {
      setCompletionPhotoError(err instanceof Error ? err.message : tBooking('photoUploadError'))
    } finally {
      setCompletionPhotoUploading(false)
      e.target.value = ''
    }
  }

  return (
    <>
    <div className={embedded ? 'flex flex-col' : 'flex flex-col bg-white border border-[#E0EDEC] rounded-[16px] overflow-hidden'}>

      {/* Header — suppressed when embedded, the parent card shows name/status/close itself */}
      {embedded ? (
        <div className="border-t border-[#E0EDEC]" />
      ) : (
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
      )}

      {/* Booking */}
      {bookings !== null && (activeBooking || (currentUserRole === 'CUSTOMER' && canRequestNew)) && (
        <div className="border-b border-[#E0EDEC] px-4 py-3">
          {activeBooking && (
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${BOOKING_STATUS_BADGE[activeBooking.status]}`}>
                  {tBooking(BOOKING_STATUS_KEY[activeBooking.status])}
                </span>
                {activeBooking.status === 'REQUESTED' && (
                  <span className="text-[11px] text-[#6B8886] ml-2">
                    {hoursLeftToRespond(activeBooking.created_at) > 0
                      ? tBooking('timeLeftToRespond', { hours: hoursLeftToRespond(activeBooking.created_at) })
                      : tBooking('lessThanHourLeft')}
                  </span>
                )}
                <p className="text-[13px] text-[#0D1F1E] mt-1.5">
                  {tBooking(activeBooking.duration_hours == null ? 'summaryNoDuration' : 'summary', {
                    cleaningType: tBooking(activeBooking.cleaning_type === 'DEEP' ? 'deepClean' : 'standardClean'),
                    bedrooms:  activeBooking.bedrooms ?? '—',
                    bathrooms: activeBooking.bathrooms ?? '—',
                    date:     bookingDateFmt.format(new Date(`${activeBooking.date}T00:00:00`)),
                    time:     activeBooking.start_time.slice(0, 5),
                    duration: activeBooking.duration_hours ?? undefined,
                  })}
                </p>
                {activeBooking.notes && (
                  <p className="text-[12px] text-[#6B8886] mt-1">{activeBooking.notes}</p>
                )}

                {currentUserRole === 'CLEANER' && activeBooking.status === 'CONFIRMED' && (
                  <div className="mt-2">
                    <p className="text-[11px] text-[#B8860B] bg-[#FDF8E1] rounded-md px-2.5 py-1.5 mb-2">
                      {tBooking('photoReminder')}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeBooking.photo_urls.map((url, i) => (
                        <img key={i} src={url} alt="" className="w-12 h-12 rounded-md object-cover border border-[#E0EDEC]" />
                      ))}
                      <button
                        type="button"
                        onClick={() => completionFileInputRef.current?.click()}
                        disabled={completionPhotoUploading}
                        aria-label="Add photo"
                        className="w-12 h-12 rounded-md border border-dashed border-[#E0EDEC] flex items-center justify-center text-[#6B8886] hover:text-[#19706A] hover:border-[#19706A] transition-colors disabled:opacity-50 text-[18px] leading-none"
                      >
                        {completionPhotoUploading ? '…' : '+'}
                      </button>
                      <input
                        ref={completionFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCompletionPhotoSelect}
                        className="hidden"
                      />
                    </div>
                    <p className="text-[11px] text-[#6B8886] mt-1">
                      {tBooking('photoCount', { count: activeBooking.photo_urls.length, min: MIN_COMPLETION_PHOTOS })}
                    </p>
                    {completionPhotoError && (
                      <p className="text-[11px] text-red-600 mt-1">{completionPhotoError}</p>
                    )}
                  </div>
                )}

                {activeBooking.status === 'COMPLETED' && activeBooking.photo_urls.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {activeBooking.photo_urls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-12 h-12 rounded-md object-cover border border-[#E0EDEC]" />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                {currentUserRole === 'CLEANER' && activeBooking.status === 'REQUESTED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBookingAction('CONFIRM')}
                      disabled={bookingActionPending}
                      className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
                    >
                      {tBooking('confirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBookingAction('DECLINE')}
                      disabled={bookingActionPending}
                      className="btn-ghost !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
                    >
                      {tBooking('decline')}
                    </button>
                  </>
                )}
                {currentUserRole === 'CLEANER' && activeBooking.status === 'CONFIRMED' && (
                  activeBooking.date <= todayStr && activeBooking.photo_urls.length >= MIN_COMPLETION_PHOTOS ? (
                    <button
                      type="button"
                      onClick={() => handleBookingAction('COMPLETE')}
                      disabled={bookingActionPending}
                      className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
                    >
                      {tBooking('markComplete')}
                    </button>
                  ) : activeBooking.date > todayStr ? (
                    <span className="text-[12px] text-[#6B8886] self-center">
                      {tBooking('notYetDue', { date: bookingDateFmt.format(new Date(`${activeBooking.date}T00:00:00`)) })}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[#6B8886] self-center">
                      {tBooking('needMorePhotos', { count: MIN_COMPLETION_PHOTOS - activeBooking.photo_urls.length })}
                    </span>
                  )
                )}
                {currentUserRole === 'CUSTOMER' && (activeBooking.status === 'REQUESTED' || activeBooking.status === 'CONFIRMED') && (
                  <button
                    type="button"
                    onClick={() => handleBookingAction('CANCEL')}
                    disabled={bookingActionPending}
                    className="btn-ghost !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
                  >
                    {tBooking('cancelBooking')}
                  </button>
                )}
              </div>
            </div>
          )}

          {bookingError && <p className="text-[12px] text-red-600 mt-2">{bookingError}</p>}

          {currentUserRole === 'CUSTOMER' && canRequestNew && !showBookingForm && (
            <div className={activeBooking ? 'mt-3' : ''}>
              <p className="text-[11px] text-[#6B8886] mb-1.5">{tBooking('bookingNudge')}</p>
              <button
                type="button"
                onClick={() => setShowBookingForm(true)}
                className="btn-secondary !px-4 !py-2 text-[13px] rounded-full"
              >
                {tBooking('requestBtn')}
              </button>
            </div>
          )}

          {showBookingForm && (
            <form onSubmit={handleBookingSubmit} className={`space-y-2 ${activeBooking ? 'mt-3' : ''}`}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('cleaningType')}</label>
                  <select
                    value={cleaningType}
                    onChange={e => setCleaningType(e.target.value as CleaningType)}
                    className="input !py-2 text-[13px]"
                  >
                    <option value="STANDARD">{tBooking('standardClean')}</option>
                    <option value="DEEP">{tBooking('deepClean')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('duration')}</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={0.5}
                    value={durationHours}
                    onChange={e => { setDurationHours(e.target.value); setDurationTouched(true) }}
                    className="input !py-2 text-[13px]"
                    required
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#6B8886] -mt-1">{tBooking('durationEstimateHint')}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('bedrooms')}</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={1}
                    value={bedrooms}
                    onChange={e => setBedrooms(e.target.value)}
                    className="input !py-2 text-[13px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('bathrooms')}</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={bathrooms}
                    onChange={e => setBathrooms(e.target.value)}
                    className="input !py-2 text-[13px]"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('date')}</label>
                  <input
                    type="date"
                    value={bookingDate}
                    min={todayStr}
                    onChange={e => setBookingDate(e.target.value)}
                    className="input !py-2 text-[13px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('startTime')}</label>
                  <select
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="input !py-2 text-[13px]"
                    required
                  >
                    <option value="" disabled>{tBooking('selectTime')}</option>
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-[#6B8886] mb-1">{tBooking('notes')}</label>
                <textarea
                  value={bookingNotes}
                  onChange={e => setBookingNotes(e.target.value.slice(0, 1000))}
                  placeholder={tBooking('notesPlaceholder')}
                  rows={2}
                  className="input !py-2 text-[13px] resize-none w-full"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={bookingSubmitting}
                  className="btn-primary !px-4 !py-2 text-[13px] rounded-full disabled:opacity-50"
                >
                  {tBooking('submit')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBookingForm(false)}
                  className="btn-ghost !px-4 !py-2 text-[13px] rounded-full"
                >
                  {tBooking('cancelForm')}
                </button>
              </div>
            </form>
          )}

          {historyBookings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#E0EDEC]">
              <button
                type="button"
                onClick={() => setShowHistory(prev => !prev)}
                className="text-[12px] text-[#19706A] hover:underline"
              >
                {showHistory ? tBooking('hideHistory') : tBooking('viewHistory', { count: historyBookings.length })}
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1.5">
                  {historyBookings.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${BOOKING_STATUS_BADGE[b.status]}`}>
                        {tBooking(BOOKING_STATUS_KEY[b.status])}
                      </span>
                      <span className="text-[#6B8886] text-right">
                        {bookingDateFmt.format(new Date(`${b.date}T00:00:00`))} · {b.start_time.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Message list */}
      <div ref={messageListRef} className="max-h-[400px] overflow-y-auto px-4 py-4">
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
                  {m.photo_url && (
                    <a href={m.photo_url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                      <img
                        src={m.photo_url}
                        alt=""
                        onLoad={handlePhotoInMessageLoad}
                        className="max-w-[220px] max-h-[220px] rounded-[16px] object-cover border border-[#E0EDEC]"
                      />
                    </a>
                  )}
                  {m.body && (
                    <div
                      className={`max-w-[75%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                        isMine
                          ? 'bg-[#19706A] text-white rounded-[16px_16px_4px_16px]'
                          : 'bg-[#E6F1FF] text-[#0D1F1E] rounded-[16px_16px_16px_4px]'
                      }`}
                    >
                      {m.body}
                    </div>
                  )}
                  <span className="text-[11px] text-[#6B8886] mt-1 px-1">
                    {timeFormatter.format(new Date(m.created_at))}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#E0EDEC] p-3">
        {photoPreview && (
          <div className="flex items-center gap-2 mb-2">
            <img src={photoPreview} alt="" className="w-12 h-12 rounded-lg object-cover border border-[#E0EDEC]" />
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="text-[12px] text-[#6B8886] hover:text-red-600 transition-colors"
            >
              {t('removePhoto')}
            </button>
          </div>
        )}
        {photoError && (
          <p className="text-[12px] text-red-600 mb-2">{photoError}</p>
        )}
        {sendFailed && (
          <p className="text-[12px] text-red-600 mb-2">{sendFailed}</p>
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
