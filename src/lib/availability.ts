// Weekly recurring availability — cleaner_profiles.availability jsonb.
//
// Replaces two earlier, mutually-incompatible shapes that were live at once
// (found 2026-08-18, see Todoist "BUG: cleaner_profiles.availability
// read/write shape mismatch"): the edit form wrote a plain string array of
// coarse tags (["weekdays","evenings"]) while every read site expected an
// object keyed by the same tags ({"weekdays": true}) — indexing an array by
// a string key is always undefined, so saved availability never actually
// displayed or matched a filter. This is the one real shape going forward:
// a day key is present only when the cleaner is available that day, absent
// (or the object empty) means unavailable — matching the "default to
// unavailable, never default to available" decision. Hours are whole
// numbers on a 24h clock (9 = 9am, 17 = 5pm), no half-hours in v1.
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = typeof DAYS[number]

export interface DayHours {
  start: number  // 0–23
  end:   number  // 1–24, must be > start
}

export type WeeklyAvailability = Partial<Record<DayKey, DayHours>>

const WEEKEND_DAYS: DayKey[] = ['sat', 'sun']
const WEEKDAY_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']
// A day counts as offering "evening" availability once it runs to/past this
// hour — matches the coarse tag customers filter/see, not a precise cutoff.
const EVENING_HOUR = 17

export function isAvailabilitySet(a: WeeklyAvailability | null | undefined): boolean {
  return !!a && Object.keys(a).length > 0
}

// Checks a cleaner's stated weekly hours against a specific requested slot —
// added 2026-08-19 for multi-cleaner bookings, which need to reject
// unavailable cleaners before a job is created. There is deliberately no
// equivalent check on the single-cleaner booking flow (POST /api/bookings) —
// a known, called-out inconsistency rather than an oversight, since no
// availability enforcement existed anywhere before this.
export function isCleanerAvailableAt(
  availability: WeeklyAvailability | null | undefined,
  date: string,       // YYYY-MM-DD
  startTime: string,  // HH:MM
  durationHours: number
): boolean {
  if (!availability) return false
  // Parsed as local midnight (not UTC) so getDay() reads the same calendar
  // day regardless of the server's timezone offset.
  const jsDay = new Date(`${date}T00:00:00`).getDay()  // 0=Sun..6=Sat
  const day = DAYS[(jsDay + 6) % 7]  // DAYS is Mon-first; rotate Sun to the end
  const hours = availability[day]
  if (!hours) return false

  const [h, m] = startTime.split(':').map(Number)
  const startHour = h + m / 60
  const endHour = startHour + durationHours
  return hours.start <= startHour && hours.end >= endHour
}

// Derives the three coarse tags the directory/profile/filter UI already
// shows and filters on, from the real weekly-hours data — same public shape
// as before the fix, just actually correct now.
export function deriveAvailabilityTags(a: WeeklyAvailability | null | undefined): ('weekdays' | 'weekends' | 'evenings')[] {
  if (!a) return []
  const tags: ('weekdays' | 'weekends' | 'evenings')[] = []
  if (WEEKDAY_DAYS.some(d => a[d])) tags.push('weekdays')
  if (WEEKEND_DAYS.some(d => a[d])) tags.push('weekends')
  if (DAYS.some(d => { const h = a[d]; return h && h.end >= EVENING_HOUR })) tags.push('evenings')
  return tags
}
