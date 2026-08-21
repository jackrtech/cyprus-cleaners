'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { extractErrorMessage } from '@/lib/utils'
import type { BookingStatus, CleaningType } from '@/types'

interface CleanerProfileRef {
  id?:              string
  slug?:            string
  display_name:     string
  photo_url:        string | null
  cities:           string[] | null
  phone?:           string | null
  email?:           string | null
  hourly_rate_eur?: number
  cleaner_service_offerings?: { code: string; price_eur: number }[] | null
}

export interface CustomerBookingRow {
  id:                 string
  introduction_id:    string
  status:             BookingStatus
  bedrooms:           number | null
  bathrooms:          number | null
  cleaning_type:      CleaningType | null
  date:               string
  start_time:         string
  duration_hours:     number | null
  notes:              string | null
  address:            string | null
  address_lat:        number | null
  address_lng:        number | null
  finding_us_notes:   string | null
  created_at:         string
  cleaner_profiles:   CleanerProfileRef | null
  booking_assignments: { id: string; cleaner_profile_id: string; cleaner_profiles: { id: string; slug: string; display_name: string; photo_url: string | null } | null; no_show_flags: { id: string; status: string } | null }[] | null
  reviews:            { id: string }[] | null
  disputes:           { id: string; status: string }[] | null
  photo_urls:         string[]
  cancellation_reason: string | null
  review_skipped_at:  string | null
  completed_at:       string | null
  payments:           { amount_eur: number; platform_fee_eur: number | null; status: string } | { amount_eur: number; platform_fee_eur: number | null; status: string }[] | null
  recurring_series:   { id: string; status: string } | null
}

// Extracted 2026-08-21 (Todoist "cleaner dashboard IA refactor" -- same
// treatment applied to the customer side) so /dashboard (Home, upcoming-
// only), /dashboard/bookings (all groups incl. history), and
// CustomerBookingCard can all share the exact same fetch + action logic.
// Each route still calls this independently (its own fetch, its own state)
// -- matches the cleaner-side hook and the rest of this codebase's
// per-page fetch pattern.
export function useCustomerBookingActions() {
  const { data: session, status: sessionStatus } = useSession()
  const tBooking = useTranslations('booking')

  const [bookings,        setBookings]        = useState<CustomerBookingRow[]>([])
  const [bookingsLoading, setBookingsLoading]  = useState(true)
  const [bookingActionPendingId, setBookingActionPendingId] = useState<string | null>(null)
  const [bookingActionError,     setBookingActionError]     = useState<string | null>(null)
  const [skippedReviewIds, setSkippedReviewIds] = useState<Set<string>>(new Set())
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReasonText, setCancelReasonText] = useState('')
  const [disputingId, setDisputingId] = useState<string | null>(null)
  const [disputeClaimText, setDisputeClaimText] = useState('')
  const [flaggingAssignmentId, setFlaggingAssignmentId] = useState<string | null>(null)
  const [noShowClaimText, setNoShowClaimText] = useState('')
  const [recurringActionPendingId, setRecurringActionPendingId] = useState<string | null>(null)
  const [skippedSeriesIds, setSkippedSeriesIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'CUSTOMER') return
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

  async function handleCancelBooking(bookingId: string, reason: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'CANCEL', reason }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const updated: CustomerBookingRow = await res.json()
      setBookings(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
      setCancellingId(null)
      setCancelReasonText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  async function handleFileDispute(bookingId: string, claim: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch('/api/disputes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking_id: bookingId, claim }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const dispute: { id: string; status: string } = await res.json()
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, disputes: [...(b.disputes ?? []), dispute] } : b
      ))
      setDisputingId(null)
      setDisputeClaimText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  async function handleFileNoShow(bookingId: string, assignmentId: string, claim: string) {
    if (bookingActionPendingId) return
    setBookingActionPendingId(bookingId)
    setBookingActionError(null)
    try {
      const res = await fetch('/api/no-show-flags', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assignment_id: assignmentId, claim }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, tBooking('actionError')))
      const flag: { id: string; status: string } = await res.json()
      setBookings(prev => prev.map(b => b.id === bookingId ? {
        ...b,
        booking_assignments: (b.booking_assignments ?? []).map(a =>
          a.id === assignmentId ? { ...a, no_show_flags: flag } : a
        ),
      } : b))
      setFlaggingAssignmentId(null)
      setNoShowClaimText('')
    } catch (err) {
      setBookingActionError(err instanceof Error ? err.message : tBooking('actionError'))
    } finally {
      setBookingActionPendingId(null)
    }
  }

  return {
    bookings, setBookings, bookingsLoading,
    bookingActionPendingId, bookingActionError,
    skippedReviewIds, setSkippedReviewIds,
    cancellingId, setCancellingId, cancelReasonText, setCancelReasonText,
    disputingId, setDisputingId, disputeClaimText, setDisputeClaimText,
    flaggingAssignmentId, setFlaggingAssignmentId, noShowClaimText, setNoShowClaimText,
    recurringActionPendingId, skippedSeriesIds,
    handleSkipNextOccurrence, handleCancelSeries,
    handleCancelBooking, handleFileDispute, handleFileNoShow,
  }
}

export type CustomerBookingActions = ReturnType<typeof useCustomerBookingActions>
