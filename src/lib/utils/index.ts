import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { BookingStatus } from '@/types'

// Merge Tailwind classes safely — use this everywhere instead of string concatenation
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format a Cyprus city for display
export function formatCity(city: string): string {
  return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase()
}

// Format hourly rate
export function formatRate(rate: number): string {
  return `€${rate}/hr`
}

// Format rating to 1 decimal place
export function formatRating(rating: number): string {
  return rating.toFixed(1)
}

// Generate a slug from a name
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Format date for display
export function formatDate(dateStr: string, locale: string = 'en'): string {
  return new Date(dateStr).toLocaleDateString(locale === 'el' ? 'el-GR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Format time for display
export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

// Stars array helper
export function getStars(rating: number): ('full' | 'empty')[] {
  return Array.from({ length: 5 }, (_, i) => (i < Math.round(rating) ? 'full' : 'empty'))
}

// Truncate bio for card display
export function truncate(str: string, maxLength: number = 120): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength).trim() + '…'
}

// Suggest a cleaning duration from bedrooms/bathrooms/cleaning type — a starting
// estimate shown pre-filled on the booking form, not a hard rule (the customer
// can still edit it). Base times per room-type and the deep-clean multiplier
// are adapted from real cleaning-time calculators (~30min/bedroom, ~45min/
// bathroom, ~1.5-1.8x for deep vs standard), rounded to the nearest half hour
// and clamped to the same 1-12h range the booking API already enforces.
export function estimateCleaningHours(
  bedrooms: number,
  bathrooms: number,
  cleaningType: 'STANDARD' | 'DEEP'
): number {
  const baseMinutes = 45 + bedrooms * 25 + bathrooms * 35
  const minutes = baseMinutes * (cleaningType === 'DEEP' ? 1.6 : 1)
  const hours = Math.round((minutes / 60) * 2) / 2
  return Math.min(12, Math.max(1, hours))
}

export interface BookingGroups<T> {
  requested: T[]
  confirmed: T[]
  history:   T[]
}

// Groups bookings into the three priority buckets used on both dashboards'
// Bookings tab: REQUESTED (needs a response) and CONFIRMED (upcoming) sorted
// soonest-first by job date/time so the most urgent one is on top; COMPLETED
// and CANCELLED are grouped together as history, most recently-scheduled
// first. Keeps the two dashboard files' sort/group logic identical without
// duplicating it — the card JSX itself still lives in each file since it
// differs meaningfully by role (read-only vs. confirm/decline + photo upload).
export function groupBookingsByPriority<T extends { status: BookingStatus; date: string; start_time: string }>(
  bookings: T[]
): BookingGroups<T> {
  const requested: T[] = []
  const confirmed: T[] = []
  const history:   T[] = []

  for (const b of bookings) {
    if (b.status === 'REQUESTED') requested.push(b)
    else if (b.status === 'CONFIRMED') confirmed.push(b)
    else history.push(b)
  }

  const byDateTime = (a: T, b: T) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)

  requested.sort(byDateTime)
  confirmed.sort(byDateTime)
  history.sort((a, b) => byDateTime(b, a))

  return { requested, confirmed, history }
}

// Extract the server's { error: "..." } message from a failed API response,
// falling back to a generic message when the body doesn't have one — use this
// instead of `throw new Error()` so users see the actual validation reason
// (e.g. "That date and time is in the past") rather than a generic failure.
export async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    return typeof data?.error === 'string' && data.error ? data.error : fallback
  } catch {
    return fallback
  }
}
