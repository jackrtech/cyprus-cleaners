import { createAdminClient } from '@/lib/supabase/server'

export const OCCURRENCE_INTERVAL_DAYS = 14

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The next occurrence date this series hasn't handled yet — "handled" means
// either a real bookings row exists for it, or it was explicitly skipped.
// Shared between the daily charge-recurring cron (which uses it to decide
// what to create/charge next) and POST /api/recurring-series/[id]/skip
// (which uses it as the default target when the caller doesn't specify a
// date), so the two can never disagree about which date is "next."
export async function computeNextOccurrenceDate(
  supabase: ReturnType<typeof createAdminClient>,
  seriesId: string,
  anchorDate: string
): Promise<string> {
  const [{ data: lastBooking }, { data: lastSkip }] = await Promise.all([
    supabase.from('bookings').select('date').eq('recurring_series_id', seriesId).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('recurring_series_skips').select('occurrence_date').eq('recurring_series_id', seriesId).order('occurrence_date', { ascending: false }).limit(1).maybeSingle(),
  ])
  const lastBookingDate = lastBooking?.date ?? anchorDate
  const lastHandledDate = lastSkip && lastSkip.occurrence_date > lastBookingDate ? lastSkip.occurrence_date : lastBookingDate
  return addDays(lastHandledDate, OCCURRENCE_INTERVAL_DAYS)
}
