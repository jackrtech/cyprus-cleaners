# Product

## Register

product

## Users

**Primary — homeowners and renters in Cyprus.**
Context: browsing on mobile, often after a recommendation or frustration with their last cleaner. Job: find a cleaner they can trust, in their city, and make contact or book without friction.

**Secondary — independent cleaners across Cyprus.**
Context: non-technical, likely mobile, may not have strong English. Job: get discovered and receive enquiries. This surface is lighter — the product is weighted toward the customer experience.

## Product Purpose

A local cleaner marketplace serving all 8 cities in Cyprus, in both Greek and English. Customers browse vetted cleaner profiles, read real reviews, and book. Cleaners list their services and receive bookings. Success looks like a customer finding a trusted regular cleaner within 2-3 minutes of arriving, and a cleaner filling their calendar without needing to advertise.

## Brand Personality

Trusted, local, calm.

Voice: warm but not gushing. Confident but not pushy. Speaks like a knowledgeable neighbour, not a startup or a corporation. Greek and English both feel natural — not translated, but native.

## Anti-references

- **Generic SaaS / startup**: no gradient hero sections, no hero-metric templates ("500+ cleaners, 1,000+ bookings, 4.9★"), no identical icon-grid feature sections, no startup-cream body backgrounds. This is a local service, not a growth-stage B2B tool.
- **Corporate / sterile**: no cold blue palettes, no stock photos of generic smiling people in branded polos, no HR-manual tone ("We are committed to excellence in cleaning solutions"). This is a neighbourhood product.

## Design Principles

1. **Trust through specificity.** Real names, real photos, real neighbourhoods. Never vague superlatives. A cleaner's profile earns trust with concrete detail — years active, cities covered, jobs done, actual reviews — not badges and star inflation.
2. **Calm confidence.** The interface feels settled, not urgent. No countdown timers, fake scarcity, or dark patterns. The user is making a decision about who enters their home; that deserves a calm, unhurried experience.
3. **Local, not global.** Cyprus-specific in every layer — city names, Greek-first sensibility, human scale. Should feel like a trusted local recommendation, not a multinational platform that happens to cover Cyprus.
4. **One job per screen.** Every page has a primary action. Navigation is obvious, not discovered. Complexity is hidden until needed.
5. **Dignity on both sides.** Cleaner profiles are not job listings on a directory board. They feel like professional introductions — name, face, specialisms, track record. The platform respects the work.

## Accessibility & Inclusion

- Target: WCAG 2.1 AA on all primary flows (browse, profile, booking, auth).
- Both Greek and English must be fully accessible — no English-only alt text or ARIA labels.
- Reduced motion: all animations must have a `prefers-reduced-motion` alternative.
- Colour contrast: body text ≥ 4.5:1, large text ≥ 3:1. The teal palette must be tested at every combination.
- Mobile-first: a significant portion of both user groups will be on mobile, often in lower-lit domestic settings.
