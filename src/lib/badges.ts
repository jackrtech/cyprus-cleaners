import { createAdminClient } from '@/lib/supabase/server'
import { isAvailabilitySet, type WeeklyAvailability } from '@/lib/availability'
import { type BadgeKey, CLEANS_MILESTONE_TIERS, TENURE_MILESTONE_TIERS, NO_TIER } from '@/lib/badgeConstants'

// V1 badge system (finalized 2026-08-19) — 5 badge types, cleaner_badges is
// an insert-only earned-instance log (see supabase/schema.sql's comment on
// the table for why). Every award function here is idempotent: it upserts
// with onConflict on the table's own unique constraint, so calling any of
// these more than once for an already-earned badge/tier is always a no-op,
// never an error and never a duplicate row.
//
// Badge keys/tiers/display-collapsing live in src/lib/badgeConstants.ts, not
// here -- that file has zero server-only imports, so client components can
// use the same constants without pulling next/headers into the browser
// bundle the way importing this file (createAdminClient) would.

async function award(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string,
  badgeKey: BadgeKey,
  tier: string = NO_TIER
): Promise<void> {
  const { error } = await supabase
    .from('cleaner_badges')
    .upsert(
      { cleaner_profile_id: cleanerProfileId, badge_key: badgeKey, tier },
      { onConflict: 'cleaner_profile_id,badge_key,tier', ignoreDuplicates: true }
    )
  if (error) console.error(`awardBadge(${badgeKey}${tier ? `/${tier}` : ''}) error:`, error)
}

// Referral badge — awarded to the REFERRING cleaner the moment a cleaner who
// used their link finishes signing up. Called once, from POST
// /api/auth/register.
export async function awardReferralBadge(
  supabase: ReturnType<typeof createAdminClient>,
  referringCleanerProfileId: string
): Promise<void> {
  await award(supabase, referringCleanerProfileId, 'referred_friend')
}

// Verified-ID badge — awarded the moment an admin approves a cleaner's ID
// verification. Called from the admin verification approve action.
export async function awardVerifiedIdBadge(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string
): Promise<void> {
  await award(supabase, cleanerProfileId, 'verified_id')
}

// Profile-completion badge — same "complete" definition the dashboard's own
// profile-completion banner already uses (bio, photo, cities, availability
// all set), so the badge and the banner can't disagree about what "complete"
// means. Called wherever a cleaner's own profile is saved.
export async function checkAndAwardProfileCompletionBadge(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string,
  profile: { bio: string | null; photo_url: string | null; cities: string[] | null; availability: WeeklyAvailability | null }
): Promise<void> {
  const complete = !!profile.bio && !!profile.photo_url && !!profile.cities?.length && isAvailabilitySet(profile.availability)
  if (complete) await award(supabase, cleanerProfileId, 'completed_profile')
}

// Cleans-milestone badges — one row per tier as total_jobs_count crosses it.
// total_jobs_count is trigger-maintained (on_booking_completed in
// schema.sql), so this reads it fresh rather than trusting a caller-supplied
// value, and awards every tier at-or-below the current count that isn't
// already earned (covers a cleaner whose count jumped past more than one
// tier between checks, e.g. a backfill or a missed call site).
export async function checkAndAwardCleansMilestones(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string
): Promise<void> {
  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('total_jobs_count')
    .eq('id', cleanerProfileId)
    .single()
  if (!profile) return

  const eligibleTiers = CLEANS_MILESTONE_TIERS.filter(t => profile.total_jobs_count >= t)
  for (const tier of eligibleTiers) {
    await award(supabase, cleanerProfileId, 'cleans_milestone', String(tier))
  }
}

// Tenure-milestone badges — one row per tier as account age crosses it.
// Purely time-based (no triggering event), so this is a lazy check: called
// whenever a cleaner's own profile is loaded, not on any cron. Worst case a
// badge shows up a little later than the exact day it was earned, which is
// fine for a cosmetic trust signal.
export async function checkAndAwardTenureMilestones(
  supabase: ReturnType<typeof createAdminClient>,
  cleanerProfileId: string,
  createdAt: string
): Promise<void> {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)
  const eligibleTiers = TENURE_MILESTONE_TIERS.filter(t => ageDays >= t.days)
  for (const { tier } of eligibleTiers) {
    await award(supabase, cleanerProfileId, 'tenure_milestone', tier)
  }
}

