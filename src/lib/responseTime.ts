import { createAdminClient } from '@/lib/supabase/server'
import { MIN_RESPONSE_SAMPLE } from '@/lib/responseTimeConstants'

// "Typically responds in..." -- a live descriptive stat (Etsy/Airbnb-style
// host response label), NOT part of the badge/achievement system. See
// supabase/schema.sql's comment on cleaner_profiles.typical_response_minutes
// for why this is a once-daily batch recompute rather than live-on-every-
// message: the task's own steer was to avoid adding latency to chat sends,
// and the once-daily cron pattern is already established for exactly this
// kind of non-urgent, no-triggering-event stat (see release-payouts,
// auto-resolve-disputes).
//
// Display bucketing (MIN_RESPONSE_SAMPLE, responseBucketFor) lives in
// src/lib/responseTimeConstants.ts, not here -- same client/server split
// reason as src/lib/badges.ts vs src/lib/badgeConstants.ts.

interface MessageRow {
  introduction_id: string
  sender_id:       string
  created_at:      string
}

// Median response time (minutes) across every introduction thread this
// cleaner has: customer's first message in the thread -> this cleaner's
// first message after it, whichever kind of message either happens to be
// (a system-event message still has a real sender and timestamp, and still
// meaningfully marks "the customer opened this conversation" or "the
// cleaner responded"). Threads with no reply yet, or where the cleaner sent
// first, are excluded -- they're not a response.
function computeResponseMinutes(messages: MessageRow[], customerIdByIntro: Map<string, string>, cleanerUserId: string): number[] {
  const byIntro = new Map<string, MessageRow[]>()
  for (const m of messages) {
    const list = byIntro.get(m.introduction_id) ?? []
    list.push(m)
    byIntro.set(m.introduction_id, list)
  }

  const diffs: number[] = []
  for (const [introId, msgs] of byIntro) {
    const customerId = customerIdByIntro.get(introId)
    if (!customerId) continue

    msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const customerFirst = msgs.find(m => m.sender_id === customerId)
    if (!customerFirst) continue

    const customerFirstAt = new Date(customerFirst.created_at).getTime()
    const cleanerReply = msgs.find(m => m.sender_id === cleanerUserId && new Date(m.created_at).getTime() > customerFirstAt)
    if (!cleanerReply) continue

    diffs.push((new Date(cleanerReply.created_at).getTime() - customerFirstAt) / (60 * 1000))
  }
  return diffs
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Recomputes and stores one cleaner's typical_response_minutes/
// response_sample_size. Called for every ACTIVE cleaner by the daily cron;
// exported separately so it stays testable/callable on its own.
export async function recomputeResponseTimeFor(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string,
  cleanerUserId: string
): Promise<void> {
  const { data: introsRaw } = await supabase
    .from('introductions')
    .select('id, customer_id')
    .eq('cleaner_profile_id', cleanerProfileId)
  const intros = (introsRaw ?? []) as { id: string; customer_id: string }[]

  if (intros.length === 0) {
    await supabase.from('cleaner_profiles').update({ typical_response_minutes: null, response_sample_size: 0 }).eq('id', cleanerProfileId)
    return
  }

  const customerIdByIntro = new Map(intros.map(i => [i.id, i.customer_id]))
  const { data: messages } = await supabase
    .from('messages')
    .select('introduction_id, sender_id, created_at')
    .in('introduction_id', intros.map(i => i.id))
    .not('introduction_id', 'is', null)

  const diffs = computeResponseMinutes((messages ?? []) as MessageRow[], customerIdByIntro, cleanerUserId)

  await supabase
    .from('cleaner_profiles')
    .update({
      typical_response_minutes: diffs.length >= MIN_RESPONSE_SAMPLE ? Math.round(median(diffs)) : null,
      response_sample_size: diffs.length,
    })
    .eq('id', cleanerProfileId)
}

export async function recomputeAllResponseTimes(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: cleaners } = await supabase
    .from('cleaner_profiles')
    .select('id, user_id')
    .eq('status', 'ACTIVE')
    .not('user_id', 'is', null)

  for (const c of cleaners ?? []) {
    await recomputeResponseTimeFor(supabase, c.id, c.user_id as string)
  }
  return cleaners?.length ?? 0
}
