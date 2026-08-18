# Cyprus Cleaners — Complete Flow Reference

Exhaustive map of every screen, route, state transition, email, and gap in the app, traced directly from the codebase (routes under `src/app/[locale]/` and `src/app/api/`, schema in `supabase/schema.sql`, types in `src/types/index.ts`). Where the code is ambiguous or untested rather than the doc being incomplete, that's called out explicitly rather than guessed at.

File refs are `path:line` — anchors as of this writing, not permanent.

---

## Table of contents

1. [Every screen](#1-every-screen)
2. [End-to-end user flows by role](#2-end-to-end-user-flows-by-role)
3. [The booking lifecycle](#3-the-booking-lifecycle)
4. [The payment flow](#4-the-payment-flow)
5. [The email map](#5-the-email-map)
6. [Known gaps and half-built flows](#6-known-gaps-and-half-built-flows)
7. [Admin flows](#7-admin-flows)
8. [Cross-party interactions](#8-cross-party-interactions)
9. [Authentication and access control](#9-authentication-and-access-control)
10. [Edge cases and race conditions](#10-edge-cases-and-race-conditions)

---

## 1. Every screen

Every `page.tsx` under `src/app/[locale]/`, in the order a user would typically meet them. "Access" is the enforced rule — middleware where noted, otherwise a client-side `useSession` guard (belt-and-suspenders, not the real boundary).

| Route | Renders | Access | Key actions | Leads to |
|---|---|---|---|---|
| `/` | Home — hero, featured cleaners, footer | Public | Browse cleaners, get started | `/cleaners`, `/get-started` |
| `/get-started` | Role picker — "I need a cleaner" / "I'm a cleaner" | Public | Pick a path | `/register`, `/register/cleaner` |
| `/for-cleaners` | Marketing/recruitment page for prospective cleaners | Public | CTA to register | `/register/cleaner` |
| `/privacy` | Static privacy policy | Public | — | — |
| `/register` | Customer signup form | Public | Submit form | Auto signs in → `/dashboard` |
| `/register/cleaner` | Cleaner signup form (adds cities, hourly rate, individual/company type) | Public | Submit form | Auto signs in → `/dashboard/cleaner` |
| `/login` | Credentials login form | Public | Sign in | Role-based redirect (see §9) |
| `/forgot-password` | Request a reset link | Public | Submit email | Check email |
| `/reset-password` | Set a new password from a token | Public (needs `?token=`) | Submit new password | `/login` |
| `/verify-email` | Confirms an email-verification token | Public (needs `?token=`) | — (automatic on load) | Dashboard banner clears |
| `/cleaners` | Directory — filterable list of active cleaners | Public | Filter, open a profile | `/cleaners/[slug]` |
| `/cleaners/[slug]` | Public cleaner profile — bio, rate, reviews | Public (Message/Book require login) | Message, book, view reviews | Login (if anon) → chat modal |
| `/dashboard` | Customer dashboard — threads, bookings, review prompts | Authenticated (redirects `CLEANER` → `/dashboard/cleaner`) | Chat, cancel booking, review, manage addresses | `/dashboard/profile` |
| `/dashboard/cleaner` | Cleaner dashboard — threads, bookings, dispute banner | `CLEANER` only | Confirm/decline/complete jobs, chat | `/dashboard/cleaner/edit`, `/dashboard/cleaner/disputes` |
| `/dashboard/cleaner/edit` | Edit cleaner profile (bio, photos, rate, cities, languages, availability) | `CLEANER` only | Save profile, upload photos | `/dashboard/cleaner` |
| `/dashboard/cleaner/disputes` | List + detail of disputes filed against this cleaner | `CLEANER` only | Submit a one-time response | — |
| `/dashboard/profile` | Shared account settings (any role) | Authenticated | Sign out; customers manage saved addresses; cleaners get a link to their public profile | — |
| `/admin` | Verification queue | `ADMIN` only | Approve/reject cleaner ID submissions | — |
| `/admin/disputes` | Dispute resolution queue | `ADMIN` only | Rule for customer or cleaner | — |
| `/admin/cancellations` | Cancellation ledger | `ADMIN` only | Read-only | — |

**Not a page, but worth listing alongside them** — `POST /api/cron/cleanup-chat-photos`, a Vercel Cron job (bearer-auth'd via `CRON_SECRET`) that deletes chat photos older than 90 days and blanks the message's `photo_path`. No UI; runs on a schedule.

**Ambiguous:** what an `ADMIN` sees at `/dashboard` (as opposed to `/admin`) isn't handled explicitly — the redirect at `dashboard/page.tsx:113` only special-cases `CLEANER`. An admin visiting `/dashboard` likely renders the customer dashboard's empty states rather than being redirected; not verified against a live admin session.

---

## 2. End-to-end user flows by role

### Customer

**Sign up & onboarding**
1. `/register` → `POST /api/auth/register` (`api/auth/register/route.ts:20-117`). Zod-validated, rejects duplicate email (409), bcrypt cost 12, inserts `users` row with `role: 'CUSTOMER'`.
2. Client immediately calls `signIn('credentials', …)` (`register/page.tsx:45`) — **the account is usable before the email is verified.** Verification only ever gates a dismissible dashboard banner, never access.
3. A verification email sends non-blocking (errors swallowed) with a 24h token.
4. Clicking the link hits `/verify-email?token=…` → `POST /api/auth/verify-email`, flips `email_verified = true`.
5. "Resend" on the dashboard banner is rate-limited to once per 5 minutes.
6. Forgot/reset password: always responds success regardless of whether the email exists (anti-enumeration); reset token valid 1h, one live token per user.

**Discover & message a cleaner**
1. `/cleaners` fetches `GET /api/cleaners` (public, no auth) — every `ACTIVE` cleaner profile, sorted by rating then review count. All filtering (city, rate, rating, gender, languages, availability, cleaner type, verified-only) happens **client-side** over the full result set — there's no server-side filter endpoint.
2. `/cleaners/[slug]` fetches the public profile plus a server-resolved `is_own_profile` flag (so a cleaner viewing themself sees a disabled CTA without their `user_id` ever reaching the client). Reviews load separately.
3. Clicking Message/Book: logged-out → redirected to `/login?return=/cleaners/{slug}`, which `login/page.tsx` reads via `safeReturnPath()` and honors after a successful CUSTOMER login (restricted to same-origin relative paths — CLEANER/ADMIN logins always land on their own dashboard regardless of `return`). Logged-in as `CLEANER` → toast refusal, cleaners can't message cleaners. Logged-in as `CUSTOMER` → `POST /api/introductions`, an idempotent find-or-create on the unique `(customer_id, cleaner_profile_id)` pair.
4. Chat opens in `ChatModal`/`ChatPanel`. Realtime via a Postgres-changes subscription on `messages`, authenticated per-connection with a custom Supabase-compatible JWT minted at `/api/supabase-token`.
5. The very first message either party sends in a thread triggers a one-time "you have a new conversation" email to the other party; never fires again for that thread.

**Booking a cleaner** — see [§3](#3-the-booking-lifecycle) for the full state machine. In short: request from inside the chat panel (card authorised, not charged) → cleaner has 24h to confirm (charges the card) or decline → job happens → cleaner marks it complete (≥4 photos required) → review prompt appears.

**Cancelling** — either party, from a `REQUESTED` or `CONFIRMED` booking. Full refund if cancelled 24h+ before the scheduled start; no refund inside that window (binary, not prorated).

**Reviewing** — appears inline under a completed booking once, per booking, if no review exists yet. "Skip" is session-local state only — it comes back on reload.

**Disputing a completed job** — **no entry point exists.** See [§6](#6-known-gaps-and-half-built-flows).

### Cleaner

**Sign up & profile**
1. `/register/cleaner` → same `POST /api/auth/register`, `role: 'CLEANER'` plus `cities[]`, `hourly_rate_eur`, `cleaner_type`. The route immediately creates a **stub `cleaner_profiles` row with `status: 'ACTIVE'`** — the profile is public and bookable from the moment of signup, complete or not.
2. `/dashboard/cleaner/edit` PATCHes `/api/cleaner-profiles/me` against an explicit field allowlist (`display_name, bio, photo_url, cover_photo_url, cities, hourly_rate_eur, cleaner_type, gender, languages, availability`). Photo/cover upload is a separate endpoint, fixed path per user (`{user_id}/avatar.jpg`), upserted.
3. The cleaner dashboard nudges profile completion while bio, photo, or cities are missing.
4. ID verification submission — **no entry point exists.** See [§6](#6-known-gaps-and-half-built-flows).
5. Once (however it happens) verification is approved, `cleaner_profiles.verified = true` and a blue badge appears on the public profile and directory card.

**Working bookings**
1. New request → email + system-message pill in the thread. 24h to `CONFIRM` (charges the customer's saved card off-session) or `DECLINE` (never charged).
2. Upload completion photos incrementally while `CONFIRMED` (private bucket, signed URLs).
3. `COMPLETE` once the scheduled date has arrived and ≥4 photos exist. Cleaner's stats (`avg_rating`, `review_count`, `unique_customer_count`, `total_jobs_count`) update via DB trigger, never from application code.
4. Disputes: `/dashboard/cleaner/disputes` shows any dispute filed against a completed job, with a red banner counting `OPEN` ones with no response yet. One response allowed, then locked.

### Admin

Covered in full in [§7](#7-admin-flows).

---

## 3. The booking lifecycle

State machine: `REQUESTED → CONFIRMED → COMPLETED`, or `REQUESTED|CONFIRMED → CANCELLED`. Every transition goes through one endpoint: `PATCH /api/bookings/[id]` (`bookings/[id]/route.ts`).

| From | Action | To | Who | What happens |
|---|---|---|---|---|
| — | Request | `REQUESTED` | Customer | `POST /api/bookings`. Validates every field server-side (bedrooms 0–10, bathrooms 1–10, duration 1–12h, address ≤200 chars, date/time not in the past). `service_type` is derived from the cleaner's first offered service, not a form field. Inserts the booking, inserts a matching `payments` row as `PENDING` (card authorised via a Stripe SetupIntent client-side beforehand, **not charged**), inserts a `REQUESTED` system message, emails the cleaner. If the payment-row insert fails, the booking insert is rolled back. |
| `REQUESTED` | *(24h passes, no response)* | `CANCELLED` | System (lazy) | **No cron job.** Enforced only on the next `GET /api/bookings` read via `expireOverdueRequests()` — any `REQUESTED` row past its 24h deadline flips to `CANCELLED` and gets a `CANCELLED` system message. The `PATCH` endpoint independently re-checks the same window and returns 409 on a stale confirm/decline attempt. |
| `REQUESTED` | Confirm | `CONFIRMED` | Cleaner only | **The customer is charged here** — an off-session Stripe PaymentIntent against the saved payment method and `stripe_customer_id`. Success → `payments.status = PAID`. Failure → `payments.status = FAILED`, 402 returned with the Stripe error surfaced to the cleaner, booking stays `REQUESTED`. Deliberate design: charging at confirm-time (not completion) discourages late cancellations and avoids ~7-day card-hold expiry on bookings confirmed well in advance. |
| `REQUESTED` | Decline | `CANCELLED` | Cleaner only | Never charged (payment was still `PENDING`), so no refund logic runs. |
| `REQUESTED` or `CONFIRMED` | Cancel | `CANCELLED` | Either party | `cancellation_reason` and `cancelled_by` stamped. If `payments.status === 'PAID'`: full refund if cancelling ≥24h before the scheduled start, otherwise none. A failed refund call is logged, not retried, and does **not** block the cancellation — flagged in-code as needing manual Stripe-dashboard follow-up. |
| `CONFIRMED` | Complete | `COMPLETED` | Cleaner only | Only once the booking's `date` has arrived **and** ≥4 completion photos are uploaded. `review_prompted_at` and cleaner stats are stamped by the `on_booking_completed` DB trigger, never the route. Customer gets an email. |

**System messages** — every `PATCH` action inserts a chat-thread pill keyed by the *action* (`CONFIRMED`, `DECLINED`, `CANCELLED`, `COMPLETED`), not just the resulting status — `DECLINE` and `CANCEL` both resolve `status` to `CANCELLED` but read differently in chat.

**No payment webhook exists anywhere in the app.** Every payment-state transition happens synchronously inline around the Stripe API call in this one route. See [§4](#4-the-payment-flow) and [§10](#10-edge-cases-and-race-conditions).

---

## 4. The payment flow

| Moment | Stripe action | Payment status | Notes |
|---|---|---|---|
| Booking form opens | `SetupIntent` created (`POST /api/stripe/setup-intent`), confirmed client-side by `BookingPaymentElement` | — | Card is authorised/saved, nothing charged |
| Booking requested | — | `PENDING` | `amount_eur = hourly_rate_eur × duration_hours`, locked in at the rate quoted now |
| Cleaner confirms | Off-session `paymentIntents.create({ confirm: true, off_session: true })` against the saved payment method | `PAID` on success, `FAILED` on error | **This is the actual charge moment** — not at booking request, not at completion |
| Cleaner declines | — | stays `PENDING` (booking → `CANCELLED`) | Never charged, nothing to refund |
| Either party cancels | `stripe.refunds.create(...)` — **only if** `payments.status === 'PAID'` and cancelling ≥24h before the scheduled start | `REFUNDED` if eligible, otherwise stays `PAID` | No partial/prorated refunds — binary on the 24h line |
| Job completed | — | stays `PAID` | No further payment action |

**What's NOT handled:**
- **No Stripe webhook route exists anywhere in `src/app/api/`.** All state above is set synchronously from what the inline API call returns. If Stripe's own async view of a charge (a disputed/reversed charge, a delayed failure) ever diverges from what was returned in the moment, nothing in the codebase reconciles it.
- A failed refund is logged to the console and silently left `PAID` — no retry, no admin alert, no visible "refund pending/failed" state beyond what the cancellations ledger badge shows admin (see §7).
- No idempotency key is passed to `paymentIntents.create` — see [§10](#10-edge-cases-and-race-conditions) for the double-charge race this opens up.
- Dispute resolution never triggers a refund or any payment action — it purely records an admin decision (see §6).

---

## 5. The email map

All templates in `src/lib/email.ts`, sent via Resend. Every template accepts a `locale`, but **most callers pass `null`** because the sending user's locale isn't tracked on bookings or messages — only `users.locale` exists, and most call sites don't look it up. So most of these render in English regardless of the recipient's actual preference. `sendDisputeResolvedEmail` and the verification-decision emails are the exception; they do fetch and pass `users.locale`.

| Trigger | Function | Recipient | Locale-aware? |
|---|---|---|---|
| Registration | `sendVerificationEmail` | new user | No |
| "Resend" click | `sendVerificationEmail` | self | No |
| Forgot password | `sendPasswordResetEmail` | requester | No |
| First message in a thread (once, ever) | `sendNewMessageEmail` | other party | No |
| Booking requested | `sendNewBookingRequestEmail` | cleaner | No |
| Booking confirmed (charge succeeded) | `sendBookingConfirmedEmail` | customer | No — explicitly hardcoded `null` (`bookings/[id]/route.ts:255`) |
| Booking completed | `sendBookingCompletedEmail` | customer | No — hardcoded `null` (`bookings/[id]/route.ts:265`) |
| ID verification approved | `sendVerificationApprovedEmail` | cleaner | Yes |
| ID verification rejected | `sendVerificationRejectedEmail` | cleaner | Yes |
| Dispute resolved | `sendDisputeResolvedEmail` | both parties, separately | Yes — framed as WON/LOST from each recipient's own side |

**Nothing emails on:** a booking decline, a booking cancellation (either party), or a cleaner responding to a dispute. A customer whose booking is cancelled by the cleaner, or whose cleaner declines outright, learns only from the in-app chat pill and dashboard — not their inbox.

**Every send is best-effort** — wrapped in try/catch at the call site so a Resend outage never fails the booking, verification decision, or any other action it's attached to. There's also a dev/staging escape hatch: if `RESEND_TEST_EMAIL` is set, every email is redirected there regardless of the real recipient, because Resend's sandbox sender silently drops mail to anyone but the account owner until a custom domain is verified.

---

## 6. Known gaps and half-built flows

Ranked by how much is already built behind each gap.

1. **Filing a dispute has no entry point.** The `disputes` table, the cleaner-response endpoint, and the full admin resolution UI are all built and functional. There is no `POST /api/disputes` route and no UI anywhere in `dashboard/page.tsx` or `BookingDetailModal.tsx` that lets a customer submit a claim. Today a dispute row can only be created by direct database access.
2. **Cleaner ID-verification submission has no entry point.** `cleaner_profiles.id_photo_url`, `selfie_photo_url`, `id_submitted_at` are fully consumed by the admin queue — including the reject-clears-`id_submitted_at`-for-resubmission logic — but nothing in `PATCH /api/cleaner-profiles/me`'s field allowlist, and no dedicated upload route/UI, lets a cleaner set them. A cleaner cannot get themself into the verification queue through the app today.
3. **No Stripe webhook** — see §4. Nothing reconciles Stripe's async state against what the synchronous API calls recorded.
4. **`chat_notifications` table is unused.** Defined in `schema.sql`, zero reads or writes anywhere in application code. Unread state is instead computed live per-request in `attachLastMessages()`.
5. **`cleaner_status` values `PAUSED` and `SUSPENDED` are unused.** Nothing in the UI or API ever sets a cleaner profile to anything but `ACTIVE` — see §10 for what that means for a booking already in flight.
6. **`schema.sql` undersells the live schema.** A whole table (`verification_tokens`, backing email-verify and password-reset tokens) and several actively-used columns (`cleaner_profiles.cities`, `cleaner_type`, `gender`, `is_mock`) are used throughout the app's API routes but absent from the checked-in schema file. Treat them as real, in-production schema — just undocumented there.
7. **A skipped review prompt doesn't persist.** `skippedReviewIds` is component state on the customer dashboard — reload the page and a skipped prompt reappears.

---

## 7. Admin flows

Three tabs under `/admin/**`, all gated to `token.role === 'ADMIN'` by middleware. Nav: `src/components/admin/AdminNav.tsx`.

### Verification queue (`/admin`)
- List: `GET /api/admin/verifications` — cleaner profiles where `id_submitted_at is not null and verified = false`, oldest first.
- Detail: a full-screen modal per row — bio, submitted ID photo, selfie, an admin-note textarea.
- Decision: `PATCH /api/admin/verifications/[id]` with `{action: 'APPROVE'|'REJECT', note?}`.
  - **Approve** → `verified = true`, note stored as `verification_note`.
  - **Reject** → `verified` stays `false`, and **clears `id_submitted_at` back to null** so the cleaner could resubmit — this is the only place that field is ever reset, which matters given gap #2 above means there's no resubmission UI either.
  - Either outcome emails the cleaner.

### Dispute resolution (`/admin/disputes`)
- `GET /api/admin/disputes` joins customer, cleaner profile, and booking (including signed completion-photo URLs).
- `PATCH /api/admin/disputes/[id]` with `{resolution: 'CUSTOMER'|'CLEANER', note?}` → stamps `status = 'RESOLVED'`, `resolved_at`, `admin_note`. Both resolved and still-open disputes remain visible in the list.
- Emails both parties, same note, framed as won/lost from each one's own side.
- **No refund or compensation logic is tied to a dispute ruling** — resolving one purely records a decision (contrast with cancellation refunds, which are automatic).

### Cancellations (`/admin/cancellations`)
- `GET /api/admin/cancellations` lists every `CANCELLED` booking that has a `cancellation_reason`, joined with who cancelled it and the payment's refund state.
- Purely a visibility tool — refund eligibility was already decided automatically at cancel-time (§3); there's no action to take here.
- Badge states: not-charged / refunded / charged-not-refunded / charge-failed.

### What the schema suggests but the admin panel doesn't have
- No way to change a cleaner's `cleaner_status` to `PAUSED`/`SUSPENDED` (or back) — see gap #6.
- No admin view onto `payments` directly (only surfaced indirectly through the cancellations ledger) — a `FAILED` or stuck `PENDING` payment outside a cancellation context has no admin-facing list.
- No user-management screen at all — no way to view/search all `users`, reset a role, or disable an account from the admin panel.

---

## 8. Cross-party interactions

Every point where one role's action visibly changes what another role sees or can do next.

| Trigger (actor) | What the other party sees | What the other party can now do |
|---|---|---|
| Customer sends the first message in a thread | Cleaner gets a one-time "new conversation" email; message appears in their chat/dashboard in realtime | Reply, or ignore |
| Customer requests a booking | Cleaner gets an email + a `REQUESTED` system pill in chat; booking appears on their dashboard with Confirm/Decline actions | Confirm (charges the customer) or Decline within 24h |
| Cleaner confirms | Customer's card is charged; customer gets `sendBookingConfirmedEmail` + a `CONFIRMED` pill | Cancel (refundable if ≥24h out), or wait for the job |
| Cleaner declines | Customer sees a `DECLINED`-flavoured pill (booking status `CANCELLED`) | No email fires — customer only learns from opening the thread |
| Either party cancels | Other party sees a `CANCELLED` pill; no email to either side | Nothing further on this booking |
| Cleaner uploads completion photos | Not visible to the customer until `COMPLETE` is called (photos aren't streamed live into the thread) | — |
| Cleaner marks complete | Customer gets `sendBookingCompletedEmail` and, on their dashboard, a review prompt | Leave a review |
| Customer leaves a review | Cleaner's `avg_rating`/`review_count` update automatically (DB trigger); review appears publicly on the cleaner's profile | Nothing actionable — cleaners can't respond to reviews |
| Admin approves/rejects verification | Cleaner gets an email either way; on approval, a verified badge appears on their public profile immediately | Nothing further, or resubmit (gap #2 — no way to actually do so) |
| Admin resolves a dispute | Both customer and cleaner get separate emails, each framed as won/lost from their own side | Nothing further — no appeal flow |
| Cleaner responds to a dispute | Nothing notifies the admin proactively — it just appears in the next `GET /api/admin/disputes` read | Admin can now see the response when they next open the queue |

---

## 9. Authentication and access control

- **Provider**: a single NextAuth Credentials provider (`src/lib/auth/config.ts:42-80`) — looks up `users` by lowercased email via the service-role admin client, compares bcrypt hash. JWT session strategy; no Supabase Auth session exists anywhere.
- **Supabase RLS bridge**: since there's no Supabase Auth session, RLS's `auth.uid()` is satisfied by a custom-signed Supabase-compatible JWT minted from the NextAuth session on demand (`src/lib/supabase/authToken.ts`, `GET /api/supabase-token`) — used specifically where the browser talks to Supabase directly (Realtime chat subscriptions, and one RLS-dependent fetch on the cleaner dashboard).
- **Route gating** — `src/middleware.ts`, combining `next-auth/middleware`'s `withAuth` with the `next-intl` middleware. Order matters (more specific first):
  1. `/admin/**` → `token.role === 'ADMIN'`
  2. `/dashboard/cleaner/**` → `token.role === 'CLEANER'` (checked before the general rule below)
  3. `/dashboard/**` → any authenticated session
  4. everything else → public
  - `/api/**` routes bypass this middleware entirely; each one calls `getServerSession` itself.
  - Every protected page **also** runs its own client-side `useSession` + `router.replace('/login')` guard — this is only to avoid a flash of unauthorized content while the session resolves; the middleware is the actual boundary.
- **Rate limiting** — in-memory, per-instance, best-effort (`middleware.ts:42-84`). Covers registration, forgot-password, resend-verification, reset-password, validate-reset-token, and the NextAuth credentials callback — 10 requests/60s per IP+path. Explicitly not reliable across a multi-instance/multi-region deployment.
- **Session shape**: `session.user = {id, email, name, role, avatar_url}`. `role` drives nearly all client-side branching — which dashboard renders, which nav links show (`Navbar.tsx`, `BottomTabBar.tsx`).
- **Post-login redirect**: `login/page.tsx` fetches the session after `signIn()` and routes by role — `CLEANER → /dashboard/cleaner`, `ADMIN → /admin`, everyone else → `/dashboard`. See gap #3 for the one place this loses context (a pending cleaner-profile visit).
- **RLS as a second line of defense**: almost every API route uses the service-role admin client and enforces authorization manually (session + row-ownership checks) inside the handler — RLS mainly matters for the few paths where the browser client talks to Supabase directly. Notable RLS specifics: `cleaner_profiles` are publicly selectable only where `status = 'ACTIVE'` (plus the owner can always see their own row); `introductions`/`messages` are visible only to the thread's two parties; `payments` and `disputes` have RLS enabled with **no policies at all**, by design — they're only ever touched via the admin client.

---

## 10. Edge cases and race conditions

- **Booking confirm/decline/cancel has a check-then-act race with no row-level guard.** `PATCH /api/bookings/[id]` (`bookings/[id]/route.ts:40-44, 180-185`) fetches the booking's current `status` in one `SELECT`, validates the requested transition against that in-memory value, then issues `.update({ status: newStatus }).eq('id', params.id)` — **without** also constraining on `.eq('status', booking.status)`. Two concurrent requests against the same `REQUESTED` booking (e.g. a double-tap on "Confirm," or a confirm and a decline landing at nearly the same moment) can both pass their individual status check before either write lands, and both proceed — for `CONFIRM` specifically, this opens a real double-charge path, since nothing stops two overlapping requests from both reaching the Stripe `paymentIntents.create` call. Not a theoretical concern — there's no idempotency key passed to that call either, so even Stripe-side dedup isn't in play.
- **Booking expiry is lazy, not scheduled.** A `REQUESTED` booking past its 24h window doesn't flip to `CANCELLED` until *something* triggers a `GET /api/bookings` (either party loading their dashboard) or a `PATCH` attempt re-checks the window. If neither party opens the app, an expired-in-spirit booking can sit as `REQUESTED` indefinitely in the database, and its payment row stays `PENDING` (never charged, since `CONFIRM` independently re-validates the window and will refuse a stale confirm with a 409).
- **A cleaner going `PAUSED`/`SUSPENDED` mid-booking would change nothing** — grepping the booking flow for any `cleaner_profiles.status` check turns up none. In practice this can't happen today (gap #6: nothing in the app ever sets those states), but if it were wired up, an in-flight `REQUESTED`/`CONFIRMED` booking would have no automatic cancellation or customer notification tied to the cleaner's profile going inactive.
- **Introduction (thread) creation race is handled explicitly.** `POST /api/introductions` (`introductions/route.ts:91-115`) catches Postgres `23505` (unique-violation on `customer_id, cleaner_profile_id`) from two concurrent "start chat" clicks and re-fetches the winning row instead of erroring — one of the few places in the codebase with an explicit concurrency guard.
- **Payment-row insert failing after the booking insert succeeds is handled by explicit rollback** (`bookings/route.ts:195-198`) — the booking row is deleted if the `payments` insert fails, so a booking can't exist without a corresponding payment row. The reverse isn't possible by construction (payment insert only runs after a successful booking insert).
- **A failed refund on cancellation does not retry or alert anyone** — logged to the console only (`bookings/[id]/route.ts:217-221`), payment status stays `PAID`, and the only visibility is the admin cancellations ledger's "charged, not refunded" badge — no active notification.
- **Email failures never block the action they're attached to** — every email call site across the app is wrapped in its own try/catch with the error only logged, consistent with the "best-effort" framing in §5. There's no retry queue; a Resend outage at the exact moment of a booking confirmation means that email is simply lost.
- **Review submission race**: `POST /api/reviews` both pre-checks for an existing review and relies on a DB-level unique constraint on `booking_id` as the actual guard (`reviews/route.ts:43-51`) — two near-simultaneous submissions for the same booking would have the second one fail at the DB constraint rather than silently duplicate.
- **Duplicate dispute-response submission is blocked by status, not a lock** — `PATCH /api/cleaner/disputes/[id]` rejects if `status !== 'OPEN'`, but since resolution requires an admin action in between, this isn't a tight race window in practice.
