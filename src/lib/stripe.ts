import Stripe from 'stripe'

// Server-only — never import from a client component.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
