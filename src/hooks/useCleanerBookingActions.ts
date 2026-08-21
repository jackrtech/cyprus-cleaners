'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { extractErrorMessage } from '@/lib/utils'
import { compressImage } from '@/lib/utils/compressImage'
import type { BookingStatus, CleaningType } from '@/types'

export interface CleanerBookingRow {
  id:             string
  status:         BookingStatus
  bedrooms:       number | null
  bathrooms:      number | null
  cleaning_type:  CleaningType | null
  date:           string
  start_time:     string
  duration_hours: number | null
  notes:          string | null
  address:        string | null
  address_lat:    number | null
  address_lng:    number | null
  finding_us_notes: string | null
  created_at:     string
  users:          { full_name: string } | null
  photo_paths:    string[]
  photo_urls:     string[]
  cancellation_reason: string | null
  booking_assignments: {
    id:                 string
    cleaner_profile_id: string
    cleaner_profiles:   { id: string; display_name: string } | null
    no_show_flags: {
      id:                 string
      status:             string
      claim:              string
      cleaner_response:   string | null
      resolve_by:         string
      no_show_corroborations: { cleaner_profile_id: string; response: string }[] | null
    } | null
  }[] | null
  recurring_series: { id: string; status: string } | null
}

// Extracted 2026-08-21 (Todoist "cleaner dashboard IA refactor") so
// /dashboard/cleaner (Home, upcoming-only), /dashboard/cleaner/bookings (all
// groups incl. history), and CleanerBookingCard can all share the exact same
// fetch + action logic instead of three copies drifting apart. Each route
// still calls this independently (its own fetch, its own state) rather than
// sharing a cache -- matches the rest of this codebase's per-page fetch
// pattern, and keeps each route's data need explicit.
export function useCleanerBookingActions() {
  const { data: session, status: sessionStatus } = useSession()
  const tBooking = useTranslations('booking')

  const [bookings,        setBookings]        = useState<CleanerBookingRow[]>([])
  const [bookingsLoading, setBookingsLoading]  = useState(true)
  const [bookingActionPendingId, setBookingActionPendingId] = useState<string | null>(null)
  const [bookingActionError,     setBookingActionError]     = useState<string | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [declineReasonText, setDeclineReasonText] = useState('')
  const [contestingFlagId, setContestingFlagId] = useState<string | null>(null)
  const [contestResponseText, setContestResponseText] = useState('')
  const [corroboratingFlagId, setCorroboratingFlagId] = useState<string | null>(null)
  const [corroborateNoteText, setCorroborateNoteText] = useState('')
  const [recurringActionPendingId, setRecurringActionPendingId] = useState<string | null>(null)
  const [skippedSeriesIds, setSkippedSeriesIds] = useState<Set<string>>(new Set())

  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)
  const [photoUploadTargetId, setPhotoUploadTargetId] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CLEANER') return
    fetch('/api/bookings')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setBookings(data) })
      .catch(() => {})
      .finally(() => setBookingsLoading(false))
  }, [session, sessionStatus])

  async function handleSkipNextOccurrence(seriesId: string) {
    if (recurringActionPendingId) return
    setRecurringActionPendingId(seriesId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/recurring-series/${seriesId}/skip`, { method: 'POST' })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      setSkippedSeriesIds(prev => new Set(prev).add(seriesId))
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setRecurringActionPendingId(null)
    }
  }

  async function handleCancelSeries(seriesId: string) {
    if (recurringActionPendingId) return
    setRecurringActionPendingId(seriesId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/recurring-series/${seriesId}`, { method: 'PATCH' })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      setBookings(prev => prev.map(b =>
        b.recurring_series?.id === seriesId ? { ...b, recurring_series: { id: seriesId, status: 'CANCELLED' } } : b
      ))
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setRecurringActionPendingId(null)
    }
  }

  async function handleBookingAction(bookingId: string, action: 'CONFIRM' | 'DECLINE' | 'COMPLETE', reason?: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, reason }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const updated: CleanerBookingRow = await res.json()
      setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
      setDecliningId(null)
      setDeclineReasonText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  async function handleContestNoShow(bookingId: string, flagId: string, response: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/no-show-flags/${flagId}/contest`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const updated: { cleaner_response: string; contested_at: string } = await res.json()
      setBookings(prev => prev.map(b => b.id !== bookingId ? b : {
        ...b,
        booking_assignments: (b.booking_assignments ?? []).map(a => ({
          ...a,
          no_show_flags: a.no_show_flags?.id === flagId ? { ...a.no_show_flags, ...updated } : a.no_show_flags,
        })),
      }))
      setContestingFlagId(null)
      setContestResponseText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  async function handleCorroborateNoShow(bookingId: string, flagId: string, response: 'CORROBORATES' | 'DISPUTES', note: string, myCleanerProfileId: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/no-show-flags/${flagId}/corroborate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response, note: note.trim() || undefined }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      setBookings(prev => prev.map(b => b.id !== bookingId ? b : {
        ...b,
        booking_assignments: (b.booking_assignments ?? []).map(a => ({
          ...a,
          no_show_flags: a.no_show_flags?.id !== flagId ? a.no_show_flags : {
            ...a.no_show_flags,
            no_show_corroborations: [
              ...(a.no_show_flags.no_show_corroborations ?? []).filter(c => c.cleaner_profile_id !== myCleanerProfileId),
              { cleaner_profile_id: myCleanerProfileId, response },
            ],
          },
        })),
      }))
      setCorroboratingFlagId(null)
      setCorroborateNoteText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  function handlePhotoAddClick(bookingId: string) {
    setPhotoUploadTargetId(bookingId)
    photoInputRef.current?.click()
  }

  async function handlePhotoFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const bookingId = photoUploadTargetId
    if (!file || !bookingId || photoUploadingId) return

    setPhotoUploadingId(bookingId)
    setPhotoUploadError(null)
    try {
      const compressed = await compressImage(file)
      const formData = new FormData()
      formData.append('photo', compressed)

      const res = await fetch(`/api/bookings/${bookingId}/photos`, {
        method: 'POST',
        body:   formData,
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('photoUploadError')))

      const result: { photo_paths: string[]; new_photo_url: string | null } = await res.json()
      setBookings(prev => prev.map(b => b.id !== bookingId ? b : {
        ...b,
        photo_paths: result.photo_paths,
        photo_urls: result.new_photo_url ? [...b.photo_urls, result.new_photo_url] : b.photo_urls,
      }))
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : tBooking('photoUploadError'))
    } finally {
      setPhotoUploadingId(null)
      setPhotoUploadTargetId(null)
      e.target.value = ''
    }
  }

  return {
    bookings, setBookings, bookingsLoading,
    bookingActionPendingId, bookingActionError,
    decliningId, setDecliningId, declineReasonText, setDeclineReasonText,
    contestingFlagId, setContestingFlagId, contestResponseText, setContestResponseText,
    corroboratingFlagId, setCorroboratingFlagId, corroborateNoteText, setCorroborateNoteText,
    recurringActionPendingId, skippedSeriesIds,
    photoUploadingId, photoUploadError, photoInputRef,
    handleSkipNextOccurrence, handleCancelSeries, handleBookingAction,
    handleContestNoShow, handleCorroborateNoShow,
    handlePhotoAddClick, handlePhotoFileSelect,
  }
}

export type CleanerBookingActions = ReturnType<typeof useCleanerBookingActions>
