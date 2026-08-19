// Cleaner-configurable service tiers + add-ons — cleaner_service_offerings.
//
// Fixed v1 canonical list (decided 2026-08-18): STANDARD is the baseline
// tier every cleaner already has via cleaner_profiles.hourly_rate_eur, never
// a row here. DEEP and MOVE_IN_OUT are opt-in tiers priced €/hr, same unit
// as hourly_rate_eur. CARPET and OVEN are opt-in add-ons priced flat
// €/booking. A cleaner_service_offerings row's presence for a given
// (cleaner, code) means "this cleaner offers it at this price" — absence
// means not offered, same "default to unavailable" convention as
// src/lib/availability.ts.
export const TIER_CODES = ['DEEP', 'MOVE_IN_OUT'] as const
export type TierCode = typeof TIER_CODES[number]

export const ADDON_CODES = ['CARPET', 'OVEN'] as const
export type AddonCode = typeof ADDON_CODES[number]

export type OfferingCode = TierCode | AddonCode
export const ALL_OFFERING_CODES: OfferingCode[] = [...TIER_CODES, ...ADDON_CODES]

export function isTierCode(code: string): code is TierCode {
  return (TIER_CODES as readonly string[]).includes(code)
}

export function isAddonCode(code: string): code is AddonCode {
  return (ADDON_CODES as readonly string[]).includes(code)
}

export function isOfferingCode(code: string): code is OfferingCode {
  return (ALL_OFFERING_CODES as readonly string[]).includes(code)
}

export interface CleanerOffering {
  code: OfferingCode
  price_eur: number
}
