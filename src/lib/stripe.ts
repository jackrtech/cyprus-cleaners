import Stripe from 'stripe'

// Server-only — never import from a client component. Lazily constructed so
// merely importing this module (e.g. during Next.js's build-time route
// analysis) never throws just because STRIPE_SECRET_KEY isn't set in that
// environment — only actually calling getStripe() does.
let cached: Stripe | null = null

export function getStripe(): Stripe {
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return cached
}

// Flat fee added to every booking on top of the cleaner's own rate, kept
// entirely by the platform — the cleaner is never charged a commission (see
// schema.sql's payments table comment). Finalized 2026-08-18 at €0.50 (was
// a €1 placeholder). Server-only, same as the rest of this file — the
// customer-facing price breakdown is read back from the payments row after
// booking, not computed client-side.
export const BOOKING_FEE_EUR = 0.50

// How long a completed booking's payout is held before it's eligible for
// release — mirrors the 24h dispute filing window (src/app/api/disputes/route.ts)
// so the two clocks stay in lockstep: no complaint within 24h of completion →
// eligible immediately after; a complaint filed within that window holds the
// payout until the dispute resolves (which has its own 24h SLA, auto-enforced
// — see src/lib/disputes.ts), not until this window separately elapses.
export const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000
