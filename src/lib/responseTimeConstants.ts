// Client-safe display logic for "typically responds in..." — split out of
// src/lib/responseTime.ts (which has the recompute functions, and therefore
// imports src/lib/supabase/server.ts, which imports next/headers at module
// top level) so a client component can compute the display bucket without
// pulling next/headers into the browser bundle. Same split as
// src/lib/badges.ts / src/lib/badgeConstants.ts, same reason.

export const MIN_RESPONSE_SAMPLE = 3

export type ResponseBucket = 'within_1_hour' | 'within_3_hours' | 'within_a_day'

// Display bucket for a stored typical_response_minutes value -- null if
// there's no meaningful label to show (too slow, or the caller should have
// already checked response_sample_size/MIN_RESPONSE_SAMPLE before calling).
export function responseBucketFor(minutes: number | null): ResponseBucket | null {
  if (minutes === null) return null
  if (minutes <= 60) return 'within_1_hour'
  if (minutes <= 180) return 'within_3_hours'
  if (minutes <= 60 * 24) return 'within_a_day'
  return null // too slow -- no flattering label to show, so show none
}
