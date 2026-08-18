# Cyprus Cleaners — Flow Reference

This document maps every user-facing flow in the app to the concrete code that implements it, so a future session can jump straight to the right file instead of re-exploring the codebase. It was written by reading `supabase/schema.sql`, `src/types/index.ts`, `src/middleware.ts`, `src/lib/auth/config.ts`, every route under `src/app/[locale]/` and `src/app/api/`, and the components/hooks they depend on. Where a flow appeared incomplete or a piece of code didn't match `schema.sql`, that's called out explicitly rather than guessed at — see especially [Data Model Reference](#data-model-reference) and [Known Gaps](#known-gaps--incomplete-flows).

Paths below are repo-relative. `file.ts:42` means "see function/logic starting around line 42" — line numbers are anchors, not exact forever, but were correct as of this writing.

## Table of contents

- [Data Model Reference](#data-model-reference)
- [Auth & Route Protection](#auth--route-protection)
- [Customer: Signup & Onboarding](#customer-signup--onboarding)
- [Customer: Discover & Message a Cleaner](#customer-discover--message-a-cleaner)
- [Booking Lifecycle](#booking-lifecycle)
- [Reviews](#reviews)
- [Disputes & Cancellations](#disputes--cancellations)
- [Cleaner: Signup, Profile & Verification](#cleaner-signup-profile--verification)
- [Admin: Verification Queue](#admin-verification-queue)
- [Admin: Dispute Resolution](#admin-dispute-resolution)
- [Admin: Cancellations (read-only)](#admin-cancellations-read-only)
- [Email Notifications Reference](#email-notifications-reference)
- [Chat / Realtime](#chat--realtime)
- [Known Gaps / Incomplete Flows](#known-gaps--incomplete-flows)

---

## Data Model Reference

Authoritative schema: `supabase/schema.sql`. TS mirror: `src/types/index.ts`.

**⚠️ `schema.sql` is stale relative to the deployed DB.** Several columns and one whole table are used throughout the app's API routes but do **not** appear anywhere in `supabase/schema.sql`:

| Used in code | Not in schema.sql |
|---|---|
| `verification_tokens` table (email verify / password reset tokens) — `src/app/api/auth/register/route.ts:97`, `verify-email/route.ts:13`, `forgot-password/route.ts:32`, `reset-password/route.ts:18`, `resend-verification/route.ts:31` | entire table missing |
| `cleaner_profiles.cities` (text array, plural) — used everywhere instead of the singular `city` column that schema.sql defines | not in schema.sql |
| `cleaner_profiles.cleaner_type` (`'individual' \| 'company'`) — `src/app/[locale]/dashboard/cleaner/edit/page.tsx:44` | not in schema.sql (schema has `is_company boolean` instead, which is now only a legacy read-fallback, see `cleaners/page.tsx:64`) |
| `cleaner_profiles.gender` (`'female' \| 'male' \| null`) | not in schema.sql |
| `cleaner_profiles.is_mock` (boolean) — `src/app/api/cleaners/route.ts:16` | not in schema.sql |
| `users.locale` is read in several places (`admin/disputes/[id]/route.ts:70`) — schema.sql *does* define this one, just noting it's actively used |

Treat `cleaner_profiles.cities`/`cleaner_type`/`gender` and the `verification_tokens` table as real, in-production schema — just undocumented in the checked-in `schema.sql`. If you're changing schema, reconcile this drift rather than assuming schema.sql is complete.

### Enums (schema.sql:11-16, types/index.ts:1-16)
- `user_role`: `CUSTOMER | CLEANER | ADMIN`
- `cleaner_status`: `ACTIVE | PAUSED | SUSPENDED` (only `ACTIVE` is used anywhere in app code — `PAUSED`/`SUSPENDED` have no UI trigger)
- `service_type`: `HOUSE | APARTMENT`
- `booking_status`: `REQUESTED → CONFIRMED → COMPLETED`, or `→ CANCELLED` from either of the first two
- `payment_status`: `PENDING | PAID | REFUNDED | FAILED`
- `cleaning_type`: `STANDARD | DEEP`
- `dispute_status`: `OPEN | RESOLVED`
- `dispute_resolution`: `CUSTOMER | CLEANER` (who the admin ruled for)

### Core tables and ownership
- `users` (schema.sql:20-33) — one row per account, `password_hash` bcrypt, `role` fixed at signup, `stripe_customer_id` populated lazily on first booking attempt.
- `cleaner_profiles` (schema.sql:40-71) — 1:1 with a `CLEANER` user, created as a stub immediately at registration (`src/app/api/auth/register/route.ts:74-92`). Denormalised stats (`avg_rating`, `review_count`, `unique_customer_count`, `total_jobs_count`) are **trigger-owned** — never written from application code. See triggers below.
- `introductions` (schema.sql:83-94) — one thread per (customer, cleaner) pair, unique constraint enforced, no approval gate.
- `bookings` (schema.sql:98-118) — belongs to an introduction; `duration_hours` is set by the customer at request time (not the cleaner, despite the schema comment on line 109 which is itself stale — see `src/app/api/bookings/route.ts:118-120,172`); `photo_paths` is private-storage paths, signed URLs generated per-request.
- `payments` (schema.sql:125-146) — 1:1 with a booking, created `PENDING` at booking-request time, moved to `PAID` when the cleaner confirms (off-session Stripe charge), `REFUNDED` on eligible cancellation, `FAILED` if the confirm-time charge errors.
- `addresses` (schema.sql:154-164) — customer's saved addresses; bookings store a free-text snapshot (`bookings.address`), not a FK, so editing/deleting a saved address never rewrites history.
- `messages` (schema.sql:168-184) — thread messages; also carries system/booking-event pills (`system_event` + `booking_id` set, `sender_id` still required even for auto-generated events).
- `reviews` (schema.sql:188-201) — 1:1 with a COMPLETED booking; `body_translations` is a DeepL cache keyed by locale.
- `disputes` (schema.sql:212-227) — customer's quality claim on a completed booking, cleaner's response, admin resolution. **No creation path found in the current codebase — see [Known Gaps](#known-gaps--incomplete-flows).**
- `chat_notifications` (schema.sql:231-238) — table exists but no code reads/writes it (grep found zero references outside schema.sql). Unread state is instead computed live in `src/app/api/introductions/route.ts:16-47` (`attachLastMessages`). Treat this table as unused/vestigial.

### Triggers (schema.sql:242-302) — never replicate this logic in application code
- `on_review_insert` → `update_cleaner_stats()`: recomputes `avg_rating`, `review_count` (from `reviews`) and `unique_customer_count`, `total_jobs_count` (from `COMPLETED` `bookings`) on the cleaner's profile, fired on every review insert.
- `on_booking_status_change` (BEFORE UPDATE) → `on_booking_completed()`: when `status` transitions to `COMPLETED`, stamps `review_prompted_at = now()` and increments `total_jobs_count` / recomputes `unique_customer_count` on the cleaner profile.

### RLS (schema.sql:304-362)
- `users`: select/update own row only.
- `addresses`: select/insert/delete own rows only (no update policy — client does delete+re-add).
- `cleaner_profiles`: public select where `status='ACTIVE'`, plus the owner can always select their own row regardless of status.
- `introductions`, `messages`: visible only to the two thread parties (customer or the cleaner-profile's `user_id`).
- `reviews`: public select, no insert/update policy for anon/authenticated roles (all writes go through the admin client from `/api/reviews`).
- `payments`, `disputes`: RLS enabled with **no policies at all** — by design, per the schema.sql comment (schema.sql:316-318): both are only ever touched via the service-role admin client in API routes, never the anon-key browser client.
- Almost all API routes use `createAdminClient()` (service-role, bypasses RLS) and enforce authorization manually via `getServerSession` + row ownership checks in the route handler itself. RLS is a second line of defense, mainly load-bearing for the few places the browser client is used directly (see `src/app/[locale]/dashboard/cleaner/page.tsx:296-308`, which fetches a Supabase access token from `/api/supabase-token` specifically so RLS's `cleaner_profiles_select_own` policy can resolve `auth.uid()`).

---

## Auth & Route Protection

- **NextAuth config**: `src/lib/auth/config.ts`. Single Credentials provider (`config.ts:42-80`) — looks up `users` by lowercased email via `createAdminClient()`, compares `password_hash` with bcrypt, returns `{id, email, name, role, avatar_url}`. JWT session strategy; `jwt`/`session` callbacks (`config.ts:83-98`) copy `id`/`role`/`avatar_url` onto the token/session. There is no Supabase Auth session anywhere — Supabase RLS `auth.uid()` is satisfied instead by a **custom-signed Supabase-compatible JWT** minted from the NextAuth session, see `src/lib/supabase/authToken.ts` and `src/app/api/supabase-token/route.ts`.
- **Route gating**: `src/middleware.ts`. Combines `next-auth/middleware`'s `withAuth` with `next-intl`'s middleware (`middleware.ts:6-40`). Role checks, in order (must stay in this order — more specific first):
  1. `/admin/**` → `token.role === 'ADMIN'` (`middleware.ts:22-24`)
  2. `/dashboard/cleaner/**` → `token.role === 'CLEANER'` (`middleware.ts:27-29`, checked before the general `/dashboard` rule)
  3. `/dashboard/**` → any authenticated user (`middleware.ts:32-34`)
  4. everything else → public, passthrough to i18n middleware
  - API routes (`/api/**`) bypass the auth/i18n middleware entirely (`middleware.ts:91-96`) — each route does its own `getServerSession` check inline.
  - Client-side, every protected page **also** does its own `useSession` + `router.replace('/login')` guard (e.g. `dashboard/page.tsx:110-114`, `admin/page.tsx:48-52`) — this is belt-and-suspenders for the flash-of-unauthorized-content case while the session resolves, not the actual security boundary (middleware is).
- **Rate limiting**: in-memory, per-instance, best-effort — `middleware.ts:42-84`. Applies to `/api/auth/register`, `forgot-password`, `resend-verification`, `reset-password`, `validate-reset-token`, and NextAuth's own `callback/credentials` (10 req/60s per IP+path). Explicitly documented as not reliable across multi-instance/multi-region deploys (`middleware.ts:42-46`).
- **Session shape**: `session.user = {id, email, name, role, avatar_url}` (`config.ts:7-24`). `role` drives almost all client-side branching (`dashboard` vs `dashboard/cleaner` vs `admin`, nav links in `Navbar.tsx:31-48`, bottom tab bar in `BottomTabBar.tsx:70`).
- **Post-login redirect**: `src/app/[locale]/login/page.tsx:32-39` fetches `/api/auth/session` after `signIn()` and routes by role (`CLEANER → /dashboard/cleaner`, `ADMIN → /admin`, else `safeReturnPath(searchParams.get('return')) ?? /dashboard`, `login/page.tsx:15-19,52`). `cleaners/[slug]/page.tsx:250` redirects unauthenticated users to `/login?return=/cleaners/${slug}`; after logging in as a CUSTOMER from that link the `return` path is honored (restricted to same-origin relative paths to prevent an open redirect) and the user lands back on the cleaner profile. CLEANER/ADMIN logins ignore `return` and always land on their own dashboard.

---

## Customer: Signup & Onboarding

1. **Register** — `src/app/[locale]/register/page.tsx` (form) → `POST /api/auth/register` (`src/app/api/auth/register/route.ts:20-117`). Validates with a zod schema (`register/route.ts:9-18`), rejects duplicate email (409), hashes password (bcrypt, cost 12), inserts `users` row with `role: 'CUSTOMER'`. Sends a verification email (non-blocking, swallows errors — `register/route.ts:94-107`) via `sendVerificationEmail` (`src/lib/email.ts:58-81`), token stored in `verification_tokens` (24h expiry).
2. Client then calls `signIn('credentials', ...)` immediately (`register/page.tsx:45`) — the account is usable **before** email verification; verification only gates a dismissible dashboard banner (`dashboard/page.tsx:315-337`, `emailVerified === false`), not access.
3. **Verify email** — link `/verify-email?token=...` → `src/app/[locale]/verify-email/page.tsx` → `POST /api/auth/verify-email` (`src/app/api/auth/verify-email/route.ts`). Looks up unexpired, unused token, flips `users.email_verified = true`, marks token used.
4. **Resend verification** — `POST /api/auth/resend-verification` (`src/app/api/auth/resend-verification/route.ts`), rate-limited to one per 5 minutes (`resend-verification/route.ts:29-45`), triggered from the dashboard banner button.
5. **Forgot / reset password** — `forgot-password/page.tsx` → `POST /api/auth/forgot-password` (always returns `{success:true}` regardless of whether the email exists, to avoid account enumeration — `forgot-password/route.ts:26-28,64-67`); token valid 1h, at most one live token per user (`forgot-password/route.ts:30-50`). `reset-password/page.tsx` validates the token via `POST /api/auth/validate-reset-token` then submits the new password via `POST /api/auth/reset-password`.
6. **Login** — `src/app/[locale]/login/page.tsx` → NextAuth `signIn('credentials', ...)`.

---

## Customer: Discover & Message a Cleaner

1. **Browse directory** — `src/app/[locale]/cleaners/page.tsx`. Fetches `GET /api/cleaners` (`src/app/api/cleaners/route.ts` — public, no auth, admin-client read of all `status='ACTIVE'` profiles sorted by rating then review count). All filtering/sorting (`cleaners/page.tsx:109-129`) and pagination happens **client-side** on the full result set — there's no server-side filter API. Filter UI: `src/components/cleaners/FilterBar.tsx` (city, max rate, min rating, gender, languages, availability, cleaner type, verified-only).
2. **Cleaner profile** — `src/app/[locale]/cleaners/[slug]/page.tsx`. `GET /api/cleaners/[slug]` (`src/app/api/cleaners/[slug]/route.ts`) returns the public profile plus `is_own_profile` (resolved server-side from the session so the page can grey out the CTA for a cleaner viewing themself, without ever leaking `user_id` to the client — `cleaners/[slug]/route.ts:28-35`). Reviews fetched separately via `GET /api/cleaners/[slug]/reviews`.
3. **Start a thread** — clicking "Message"/"Book" calls `ensureThreadAndOpenChat()` (`cleaners/[slug]/page.tsx:247-280`): if logged out, redirects to `/login?return=...` (honored on the way back in — see [Auth & Route Protection](#auth--route-protection)); if logged in as CLEANER, shows a toast and refuses (cleaners can't message other cleaners); if logged in as CUSTOMER, `POST /api/introductions` with `cleaner_profile_id` (`src/app/api/introductions/route.ts:53-118`) — idempotent find-or-create keyed on the unique `(customer_id, cleaner_profile_id)` pair, handles the race where two concurrent requests both try to create the same thread (Postgres `23505` unique-violation → re-fetch the winner, `introductions/route.ts:100-115`).
4. **Chat** — opens `ChatModal`/`ChatPanel` (`src/components/chat/ChatModal.tsx`, `src/components/chat/ChatPanel.tsx`). Messages: `GET/POST /api/messages` (`src/app/api/messages/route.ts`) — participant-checked via `isParticipant()` (`messages/route.ts:15-32`), supports text and/or a photo (private `chat-photos` bucket, signed URLs regenerated per-fetch, 1h TTL — `messages/route.ts:34-55`). GET also marks the other party's unread messages read as a side effect (`messages/route.ts:86-91`). Realtime: `ChatPanel.tsx:218-255` subscribes to Postgres-changes INSERT on `messages` filtered by `introduction_id`, using a Supabase-compatible JWT minted per-connection via `GET /api/supabase-token` (this requires Realtime to be enabled on the `messages` table in the Supabase dashboard — not automatic from schema.sql alone, per the CLAUDE.md note).
5. **First-message email** — on the very first message either party sends in a thread, `POST /api/messages` sends a one-time "new conversation" email to the other party and stamps `introductions.last_emailed_at` so it never fires again for that thread (`messages/route.ts:178-235`) — this is a thread-level "you have a new conversation" notice, not a per-message notification.
6. Dashboard messages list: `GET /api/introductions` (`introductions/route.ts:120-187`) branches by role — customers see their threads with cleaner_profiles joined, cleaners see theirs with the customer's `full_name` joined, admins see everything unfiltered. `attachLastMessages()` (`introductions/route.ts:16-47`) batches in the most recent message + unread flag per thread to avoid N+1 queries.

---

## Booking Lifecycle

State machine: `REQUESTED → CONFIRMED → COMPLETED`, or `REQUESTED|CONFIRMED → CANCELLED`. All transitions go through one endpoint.

1. **Request** (CUSTOMER only) — booking form lives inside `ChatPanel` (`src/components/chat/ChatPanel.tsx:610-797`), not a separate page. Requires: cleaning type, bedrooms/bathrooms (duration auto-estimated via `estimateCleaningHours()` in `src/lib/utils/index.ts:70-79`, editable), date/time (15-min slots 07:00–20:00, `ChatPanel.tsx:66-74`), a saved address (picker fetches `GET /api/addresses`, or opens `AddressFormModal` to add one), and a **saved card** — a Stripe `SetupIntent` is created via `POST /api/stripe/setup-intent` (`src/app/api/stripe/setup-intent/route.ts`) as soon as the form opens, and `BookingPaymentElement` (`src/components/chat/BookingPaymentElement.tsx`) confirms it client-side before submit. `POST /api/bookings` (`src/app/api/bookings/route.ts:85-241`): validates every field server-side again (bounds on bedrooms 0-10, bathrooms 1-10, duration 1-12h, address ≤200 chars, date/time not in the past), derives `service_type` from the cleaner's first offered service (no longer a form field, `bookings/route.ts:147-154`), inserts the booking as `REQUESTED`, inserts a matching `payments` row as `PENDING` (amount = `hourly_rate_eur × duration_hours`, card **not charged yet**), inserts a `REQUESTED` system-event message, and emails the cleaner (`sendNewBookingRequestEmail`). If the payment-row insert fails, the booking is rolled back (`bookings/route.ts:195-198`).
2. **24h response window** — a cleaner has 24h to CONFIRM or DECLINE. There's no cron/scheduled job for this: expiry is enforced **lazily**, on the next `GET /api/bookings` read, by `expireOverdueRequests()` (`bookings/route.ts:16-49`) which flips any `REQUESTED` row past its deadline to `CANCELLED` and inserts a `CANCELLED` system message. The PATCH endpoint independently re-checks the same window and refuses a stale CONFIRM/DECLINE with a 409 (`src/app/api/bookings/[id]/route.ts:63-69`).
3. **Confirm** (CLEANER only) — `PATCH /api/bookings/[id]` with `{action: 'CONFIRM'}` (`bookings/[id]/route.ts:74-136`). This is where the customer is actually **charged**: an off-session Stripe PaymentIntent is created and confirmed immediately against the saved `provider_payment_method_id` and the customer's `stripe_customer_id` (`bookings/[id]/route.ts:106-114`). On success, `payments.status → PAID`. On failure, `payments.status → FAILED` and a 402 is returned with the Stripe error message surfaced to the cleaner. Booking → `CONFIRMED`. Deliberate design (per schema.sql:126-129 comment): charging at confirm-time (not completion) discourages last-minute cancellations and sidesteps ~7-day card-auth-hold expiry for bookings confirmed well ahead of the job date.
4. **Decline** (CLEANER only) — `{action: 'DECLINE'}`, only valid from `REQUESTED` → `CANCELLED`. Never charged (payment was still `PENDING`), so no refund logic runs.
5. **Cancel** (either party) — `{action: 'CANCEL', reason}`, valid from `REQUESTED` or `CONFIRMED` → `CANCELLED`. `cancellation_reason` and `cancelled_by` are stamped (`bookings/[id]/route.ts:174-178`). **Refund logic** (`bookings/[id]/route.ts:197-222`): only runs if the payment was `PAID`; full refund via `stripe.refunds.create` if cancelling ≥24h before the booking's scheduled start (`CANCELLATION_REFUND_WINDOW_MS`), otherwise no refund at all (binary, not prorated). A failed refund call is logged but does not block the cancellation itself — flagged as needing manual Stripe-dashboard follow-up (`bookings/[id]/route.ts:217-221`). UI: customer cancels from a booking card on `dashboard/page.tsx:171-191` (reason textarea inline), cleaner declines the same way from `dashboard/cleaner/page.tsx:229-249`.
6. **Complete** (CLEANER only) — `{action: 'COMPLETE'}`, only valid from `CONFIRMED`, and only once the booking's `date` has arrived (`bookings/[id]/route.ts:158-160`) and **at least 4 completion photos** have been uploaded (`MIN_COMPLETION_PHOTOS`, `bookings/[id]/route.ts:161-166`). Photos are uploaded incrementally via `POST /api/bookings/[id]/photos` (`src/app/api/bookings/[id]/photos/route.ts`) while the booking is `CONFIRMED` — cleaner-only, private `booking-photos` bucket, one path appended per upload. On COMPLETE, `review_prompted_at` and the cleaner's stats are stamped by the **DB trigger**, not this route (`bookings/[id]/route.ts:171-173`). Customer gets `sendBookingCompletedEmail`.
7. **System messages** — every PATCH action inserts a corresponding message with `system_event` set (`REQUESTED|CONFIRMED|DECLINED|CANCELLED|COMPLETED`) so the chat thread shows an inline pill; note DECLINE and CANCEL both resolve `booking.status` to `CANCELLED` but are recorded as distinct system events so they read differently in chat (`bookings/[id]/route.ts:224-240`).
8. **Booking detail view** — `src/components/dashboard/BookingDetailModal.tsx`, opened from a booking card on either dashboard or from a system-message pill in chat (`ChatPanel.tsx:832-846`). Shows status, date/time/rooms summary, address, notes, and job photos (signed URLs).
9. **No payment webhook** — there is no Stripe webhook route anywhere in `src/app/api/`. All payment-state transitions (`PAID`, `FAILED`, `REFUNDED`) happen synchronously inline in the PATCH handler around the Stripe API call. If Stripe's own async state (e.g. a disputed/reversed charge, a delayed payment method failure) ever diverges from what was returned synchronously, nothing in this codebase would reconcile it.

---

## Reviews

1. **Prompt** — `src/components/reviews/ReviewPrompt.tsx`. Rendered inline under a completed booking card on the customer dashboard whenever `booking.status === 'COMPLETED' && no existing review && not locally skipped` (`dashboard/page.tsx:203-205,293-305`). "Skip" is session-local only (`skippedReviewIds` state) — it does not persist, so a skipped prompt reappears on next visit/reload.
2. **Submit** — `POST /api/reviews` (`src/app/api/reviews/route.ts`). CUSTOMER-only, requires the booking to be `COMPLETED`, owned by the requesting customer, and not already reviewed (unique on `booking_id`, enforced both at the DB level and with an explicit pre-check, `reviews/route.ts:43-51`). Rating 1-5 int, body optional ≤1000 chars.
3. **Stats update** — `avg_rating`/`review_count` on the cleaner profile are recomputed by the `on_review_insert` trigger (schema.sql:242-276), never touched by `/api/reviews` directly (explicit comment, `reviews/route.ts:53-54`).
4. **Display** — `src/components/cleaners/ReviewItem.tsx` on the cleaner profile page (`cleaners/[slug]/page.tsx:467-489`), fetched via `GET /api/cleaners/[slug]/reviews`.
5. **Translation** — `POST /api/translate-review` (`src/app/api/translate-review/route.ts`) — DeepL-backed, on-demand translation of a review body to the viewer's locale, cached into `reviews.body_translations` keyed by locale (skipped/uncached for `mock-*` review ids, which are synthetic seed data).

---

## Disputes & Cancellations

Disputes are a **separate concept from cancellations**: a dispute is a quality/property claim on a *completed* booking (photos + claim + cleaner response, reviewed by admin); a cancellation is either party backing out of a `REQUESTED`/`CONFIRMED` booking (see [Booking Lifecycle](#booking-lifecycle) step 5). Both eventually surface in the admin panel but through separate tables/pages.

### Dispute flow
1. **Filing a dispute** — **no code path exists for this.** There is no `POST /api/disputes` route, and no UI anywhere in `src/app/[locale]/dashboard/` or `src/components/dashboard/BookingDetailModal.tsx` that lets a customer submit a `claim`. The `disputes` table, the cleaner-response endpoint, and the full admin resolution UI are all built and working — but the entry point that would create the row is missing. In practice a dispute row today can only be created by direct DB access (Supabase SQL editor / support). See [Known Gaps](#known-gaps--incomplete-flows).
2. **Cleaner responds** — `src/app/[locale]/dashboard/cleaner/disputes/page.tsx` (list + `FullScreenModal` detail), `GET /api/cleaner/disputes` (`src/app/api/cleaner/disputes/route.ts`, scoped to the signed-in cleaner's own profile only) and `PATCH /api/cleaner/disputes/[id]` (`src/app/api/cleaner/disputes/[id]/route.ts`) to submit `cleaner_response` (once only — route rejects if `status !== 'OPEN'`, and the UI hides the textarea once a response exists). The cleaner dashboard shows a red banner with an open-dispute count needing a response (`dashboard/cleaner/page.tsx:203-214,529-541`), counting disputes that are `OPEN` **and** have no `cleaner_response` yet.
3. **Admin resolves** — `src/app/[locale]/admin/disputes/page.tsx`, `GET /api/admin/disputes` (joins customer, cleaner profile, booking incl. signed completion-photo URLs), `PATCH /api/admin/disputes/[id]` (`src/app/api/admin/disputes/[id]/route.ts`) with `{resolution: 'CUSTOMER'|'CLEANER', note?}`. Stamps `status='RESOLVED'`, `resolved_at`, `admin_note`. Both resolved and open disputes stay in the list (resolved ones just show the outcome). Emails both parties via `sendDisputeResolvedEmail`, framed as `WON`/`LOST` from each recipient's own perspective (same admin note to both — `admin/disputes/[id]/route.ts:67-103`).
4. **No refund/compensation logic tied to dispute resolution** — resolving a dispute purely records an admin decision; it does not trigger any payment/refund action on its own (contrast with cancellation refunds, which are automatic).

### Cancellation flow (admin-visible, read-only)
- `src/app/[locale]/admin/cancellations/page.tsx` + `GET /api/admin/cancellations` (`src/app/api/admin/cancellations/route.ts`) lists every `CANCELLED` booking that has a `cancellation_reason`, joined with who cancelled it (`cancelled_by_user`) and the payment's refund state. Purely a visibility tool — no admin action available here (refund eligibility was already decided automatically at cancel-time, see Booking Lifecycle step 5). Badge logic (`admin/cancellations/page.tsx:110-117`): not-charged / refunded / charged-not-refunded / charge-failed.

---

## Cleaner: Signup, Profile & Verification

1. **Register** — `src/app/[locale]/register/cleaner/page.tsx` → same `POST /api/auth/register` as customers but `role: 'CLEANER'` plus `cities[]`, `hourly_rate_eur`, `cleaner_type`. The route immediately creates a **stub `cleaner_profiles` row** (`register/route.ts:74-92`) with `status: 'ACTIVE'` (so the profile is live/public from the moment of signup, even though it's incomplete) and a slug derived from the display name + a 6-char id suffix (`slugify()`, `src/lib/utils/index.ts:26-33`).
2. **Complete profile** — `src/app/[locale]/dashboard/cleaner/edit/page.tsx`. Fetches current profile via `GET /api/cleaner-profiles/me`, PATCHes via `PATCH /api/cleaner-profiles/me` (`src/app/api/cleaner-profiles/me/route.ts:26-74`) — only an explicit allowlist of fields can be updated (`display_name, bio, photo_url, cover_photo_url, cities, hourly_rate_eur, cleaner_type, gender, languages, availability` — `cleaner-profiles/me/route.ts:26-29`). Photo/cover-photo upload is a separate call: `POST /api/cleaner-profiles/upload-photo` (`src/app/api/cleaner-profiles/upload-photo/route.ts`), stores to the public `cleaner-photos` bucket at a fixed per-user path (`{user_id}/avatar.jpg` or `{user_id}/cover.jpg`, upserted).
3. **Profile-incomplete banner** — cleaner dashboard shows a nudge whenever bio, photo, or cities are missing (`dashboard/cleaner/page.tsx:332-333,543-556`).
4. **ID verification (submission side) — not implemented.** `cleaner_profiles.id_photo_url`, `selfie_photo_url`, and `id_submitted_at` exist in the schema and are fully consumed by the admin queue (see below), but nothing in the codebase lets a cleaner actually submit them: they're not in the `PATCH /api/cleaner-profiles/me` allowlist, and there's no dedicated upload UI/route for ID documents. A cleaner cannot currently get themselves into the verification queue through the app. See [Known Gaps](#known-gaps--incomplete-flows).
5. **Approve/reject outcome** — once (however it happens) `id_submitted_at` is set and an admin acts on it, the cleaner is emailed `sendVerificationApprovedEmail` or `sendVerificationRejectedEmail` and, if approved, `cleaner_profiles.verified = true` — surfaced as a blue "verified" badge on the public profile (`cleaners/[slug]/page.tsx:376-381`) and directory card.
6. **Own-profile preview** — a cleaner viewing their own public profile page sees a "previewing" banner instead of the normal breadcrumb, and the Book/Message CTAs are disabled (`cleaners/[slug]/page.tsx:334-340,426-434,525-533`), resolved server-side via `is_own_profile` from `GET /api/cleaners/[slug]`.
7. **Booking/message handling** — see [Booking Lifecycle](#booking-lifecycle) and [Discover & Message](#customer-discover--message-a-cleaner); cleaner-side dashboard is `src/app/[locale]/dashboard/cleaner/page.tsx`, structurally parallel to the customer dashboard but adds confirm/decline actions, photo upload for completion, and the disputes banner.

---

## Admin: Verification Queue

- List: `src/app/[locale]/admin/page.tsx` + `GET /api/admin/verifications` (`src/app/api/admin/verifications/route.ts`) — cleaner profiles where `id_submitted_at is not null and verified = false`, oldest submission first. Clicking a row opens a `FullScreenModal` detail view (`admin/page.tsx:156-247`) showing bio, submitted ID photo, selfie photo, and an admin-note textarea.
- Decision: `PATCH /api/admin/verifications/[id]` (`src/app/api/admin/verifications/[id]/route.ts`) with `{action: 'APPROVE'|'REJECT', note?}`.
  - **APPROVE**: `verified = true`, stores the note as `verification_note`.
  - **REJECT**: `verified = false`, **clears `id_submitted_at` back to null** so the cleaner can resubmit (`admin/verifications/[id]/route.ts:50-54`) — this is the *only* place `id_submitted_at` is ever reset, which matters given there's no resubmission UI either (see Known Gaps).
  - Either way, emails the cleaner (`sendVerificationApprovedEmail` / `sendVerificationRejectedEmail`).
- Nav: `src/components/admin/AdminNav.tsx` — three tabs (Verifications / Disputes / Cancellations), all under `/admin/**`, gated by `middleware.ts` to `ADMIN` role.

## Admin: Dispute Resolution

Covered in detail under [Disputes & Cancellations](#disputes--cancellations) — `src/app/[locale]/admin/disputes/page.tsx`, `GET/PATCH /api/admin/disputes[/[id]]`.

## Admin: Cancellations (read-only)

Covered under [Disputes & Cancellations](#disputes--cancellations) — `src/app/[locale]/admin/cancellations/page.tsx`, `GET /api/admin/cancellations`. No write actions.

---

## Email Notifications Reference

All templates live in `src/lib/email.ts`, sent via Resend (`RESEND_API_KEY`). Every template is bilingual (en/el) based on a `locale` param passed in by the caller — **but most callers pass `null`** because the sending user's locale isn't tracked on bookings/messages (only `users.locale` exists and most triggers don't look it up), so most of these render in English regardless of the recipient's actual locale preference (explicit inline comments at each call site, e.g. `bookings/[id]/route.ts:255,265`). `sendDisputeResolvedEmail` and the verification emails are the exception — they do fetch and pass `users.locale`.

| Trigger | Function | Recipient | Fires from |
|---|---|---|---|
| Registration | `sendVerificationEmail` | new user | `api/auth/register/route.ts:103` |
| "Resend" click | `sendVerificationEmail` | self | `api/auth/resend-verification/route.ts:70` |
| Forgot password | `sendPasswordResetEmail` | requester | `api/auth/forgot-password/route.ts:61` |
| First message in a thread | `sendNewMessageEmail` | other party (once per thread, ever) | `api/messages/route.ts:219` |
| Booking requested | `sendNewBookingRequestEmail` | cleaner | `api/bookings/route.ts:224` |
| Booking confirmed | `sendBookingConfirmedEmail` | customer | `api/bookings/[id]/route.ts:253` |
| Booking completed | `sendBookingCompletedEmail` | customer | `api/bookings/[id]/route.ts:263` |
| ID verification approved | `sendVerificationApprovedEmail` | cleaner | `api/admin/verifications/[id]/route.ts:77` |
| ID verification rejected | `sendVerificationRejectedEmail` | cleaner | `api/admin/verifications/[id]/route.ts:83` |
| Dispute resolved | `sendDisputeResolvedEmail` | both customer and cleaner (separately, own perspective) | `api/admin/disputes/[id]/route.ts:75,92` |

All sends are **non-blocking / best-effort** — wrapped in try/catch at the call site so an email failure never fails the underlying action (booking, verification decision, etc.). `sendEmail()` (`email.ts:46-54`) also has a dev/staging escape hatch: if `RESEND_TEST_EMAIL` is set, every email is redirected there regardless of the real recipient, because Resend's sandbox `onboarding@resend.dev` sender silently drops mail to anyone but the account owner until a custom domain is verified.

No email fires on: booking DECLINE, booking CANCEL (either party), or a cleaner responding to a dispute.

---

## Chat / Realtime

Already covered inline in [Discover & Message](#customer-discover--message-a-cleaner) step 4, repeated here for lookup:
- Component: `src/components/chat/ChatPanel.tsx` (used embedded in both dashboards) and `src/components/chat/ChatModal.tsx` (full-screen wrapper used from the cleaner profile page).
- REST: `GET/POST /api/messages`, `PATCH /api/messages/[id]` (manual read-receipt update, though GET already auto-marks read — `messages/[id]/route.ts` looks mostly superseded by the auto-mark-read behavior in `GET /api/messages`).
- Realtime: Supabase Realtime channel `chat:{introductionId}`, Postgres-changes INSERT filter, auth'd via a per-connection custom JWT (`src/lib/supabase/authToken.ts`, minted at `/api/supabase-token`). Must be manually enabled in Supabase Dashboard → Replication for the `messages` table (not part of `schema.sql`).
- Chat photo retention: `src/app/api/cron/cleanup-chat-photos/route.ts`, a Vercel Cron job (auth'd via `CRON_SECRET` bearer header) that deletes chat photos older than 90 days from the `chat-photos` bucket and blanks `messages.photo_path`, substituting a placeholder body text for photo-only messages so the `messages_content_present` check constraint still holds (schema.sql:178).

---

## Known Gaps / Incomplete Flows

Flagged inline above; collected here for a quick scan:

1. **Disputes have no creation path.** The whole cleaner-response + admin-resolution pipeline is built and functional, but no `POST /api/disputes` route or customer-facing "file a dispute" UI exists anywhere in the codebase. Confirmed by grepping for `.insert(...)` against the `disputes` table (only in the schema) and for any "claim"/"dispute" UI in `dashboard/page.tsx` and `BookingDetailModal.tsx` (none found).
2. **Cleaner ID verification has no submission path.** `id_photo_url`, `selfie_photo_url`, `id_submitted_at` are fully wired into the admin queue and REJECT-resets-for-resubmission logic, but there's no upload UI or API route that lets a cleaner set them in the first place — they're absent from `PATCH /api/cleaner-profiles/me`'s allowlist.
3. **No Stripe webhook.** All payment state transitions are synchronous, inline in `PATCH /api/bookings/[id]`. Nothing reconciles state if Stripe's async view of a charge/refund ever diverges from what the synchronous API call returned.
4. **`chat_notifications` table is unused.** Defined in schema.sql, zero references in application code — unread-message state is instead computed live per-request.
5. **`cleaner_status` values `PAUSED`/`SUSPENDED` are unused.** No UI/API sets a cleaner profile to anything but `ACTIVE`.
6. **Schema drift** — see the top of [Data Model Reference](#data-model-reference): `verification_tokens` table and `cleaner_profiles.cities`/`cleaner_type`/`gender`/`is_mock` columns are used throughout the app but absent from `supabase/schema.sql`.
7. **Review "skip" doesn't persist.** `skippedReviewIds` in `dashboard/page.tsx` is component state only — a skipped review prompt reappears on next page load.
