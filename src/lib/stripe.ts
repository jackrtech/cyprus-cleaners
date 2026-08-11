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
