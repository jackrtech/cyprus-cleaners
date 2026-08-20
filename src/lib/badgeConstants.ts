// Client-safe badge constants + the display-collapsing logic — split out of
// src/lib/badges.ts (which also has the award functions, and therefore
// imports the server-only admin Supabase client) so a client component can
// import badge types/labels without pulling next/headers into the browser
// bundle.

export type BadgeKey = 'referred_friend' | 'completed_profile' | 'cleans_milestone' | 'verified_id' | 'tenure_milestone'

export const CLEANS_MILESTONE_TIERS = [1, 25, 50, 100, 250] as const
export const TENURE_MILESTONE_TIERS = [
  { tier: '1_month',  days: 30 },
  { tier: '6_months', days: 182 },
  { tier: '1_year',   days: 365 },
] as const

// '' marks "no tier" for the three non-tiered badges -- see the fuller
// explanation in src/lib/badges.ts's award().
export const NO_TIER = ''

export interface EarnedBadge {
  badge_key: BadgeKey
  tier:      string  // '' for non-tiered badges
}

// Collapses a cleaner's full earned-badge log down to what should actually
// be displayed — one entry per badge_key, the highest tier only for the two
// milestone badges (per the finalized spec: "show highest-achieved tier
// only per category, not all badges ever earned stacked up").
export function displayBadges(rows: EarnedBadge[]): EarnedBadge[] {
  const highestTierIndex = new Map<string, number>() // badge_key -> index into result array, for tiered badges only
  const result: EarnedBadge[] = []

  for (const row of rows) {
    if (row.tier === NO_TIER) {
      result.push(row)
      continue
    }
    const tiers = row.badge_key === 'cleans_milestone' ? CLEANS_MILESTONE_TIERS.map(String) : TENURE_MILESTONE_TIERS.map(t => t.tier)
    const rank = tiers.indexOf(row.tier)
    const existingIndex = highestTierIndex.get(row.badge_key)
    if (existingIndex === undefined) {
      highestTierIndex.set(row.badge_key, result.length)
      result.push(row)
    } else if (rank > tiers.indexOf(result[existingIndex].tier)) {
      result[existingIndex] = row
    }
  }

  return result
}
