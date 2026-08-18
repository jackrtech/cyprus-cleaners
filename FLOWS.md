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
11. [Data model reference](#11-data-model-reference)

---

## 1. Every screen

Every `page.tsx` under `src/app/[locale]/`, in the order a user would typically meet them. "Access" is the enforced rule — middleware where noted, otherwise a client-side `useSession` guard (belt-and-suspenders, not the real boundary).

File paths below sit under one of three route groups — `(marketing)/`, `(auth)/`, or `(app)/` — which only organize files, not URLs (a route group's parentheses never appear in the actual path, so every URL in the table below is unchanged). `(marketing)/layout.tsx` renders Navbar+Footer; `(auth)/layout.tsx` is a minimal logo-only header (no Navbar/Footer, to reduce signup drop-off); `(app)/layout.tsx` renders Navbar (desktop) + `BottomTabBar` (mobile) and is the one place the per-page auth/role redirect guard now lives (see below) — `BottomTabBar` no longer renders outside this group, so it no longer shows on marketing pages for a logged-in user the way it briefly used to.
- **Regression caught and fixed same day (2026-08-18):** `Navbar` used to hide itself on mobile unconditionally whenever the visitor was logged in — safe only because `BottomTabBar` was global before this split and covered mobile nav everywhere. Scoping `BottomTabBar` to `(app)` broke that: a logged-in visitor on a *marketing* page, on mobile, briefly had no nav at all (no top bar, no bottom bar) — reported from a real phone, not caught by testing since this environment's browser-automation viewport resize doesn't actually change `window.innerWidth`. Fixed by making the mobile-hide behavior an explicit `hideOnMobileWhenLoggedIn` prop on `Navbar` (default `false`); only `(app)/layout.tsx` passes `true`.

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
| `/dashboard/cleaner/earnings` | Payout setup + held/blocked/paid balance, per-job payout status | `CLEANER` only | Start Stripe Connect onboarding | Stripe-hosted onboarding (external), back here on return |
| `/dashboard/profile` | Shared account settings (any role) | Authenticated | Sign out; customers manage saved addresses; cleaners get a link to their public profile | — |
| `/admin/analytics` | Business-level metrics — bookings/revenue/dispute trends | `ADMIN` only | Read-only | — |
| `/admin` | Verification queue | `ADMIN` only | Approve/reject cleaner ID submissions | — |
| `/admin/disputes` | Dispute resolution queue | `ADMIN` only | Rule for customer or cleaner | — |
| `/admin/cancellations` | Cancellation ledger | `ADMIN` only | Read-only | — |

**Not pages, but worth listing alongside them** — three Vercel Cron jobs (all bearer-auth'd via `CRON_SECRET`, no UI, `vercel.json`):
- `GET /api/cron/cleanup-chat-photos` — deletes chat photos older than 90 days and blanks the message's `photo_path`.
- `GET /api/cron/auto-resolve-disputes` — closes any dispute past its 24h SLA with a forced full customer refund; see §7. Scheduled every 15 minutes, but the *actual* enforcement doesn't depend on that cadence — `GET /api/admin/disputes` runs the same check lazily on every load.
- `GET /api/cron/release-payouts` — transfers any cleaner payout whose hold has cleared; see §4. Same 15-minute schedule, same lazy backstop pattern (`GET /api/cleaner-profiles/me/earnings`, `GET /api/admin/users`).

**Confirmed rough edge:** what an `ADMIN` sees at `/dashboard` (as opposed to `/admin`) isn't handled explicitly — the redirect in `(app)/layout.tsx` only special-cases `CLEANER`. Verified against a live admin session (2026-08-18): an admin visiting `/dashboard` renders "Welcome back, {name}" with the booking/message panels stuck on their loading skeleton forever — `dashboard/page.tsx`'s data-fetch effects are gated on `role === 'CUSTOMER'`, so they never fire for `ADMIN`. Not a crash, just a dead end; no redirect exists to bounce an admin back to `/admin`.

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
6. **Favoriting a cleaner** (added 2026-08-18) — a heart toggle on the directory card (next to the rate) and the profile page (next to the name), `CUSTOMER`-only (hidden entirely for `CLEANER`/`ADMIN`, redirects a logged-out click to `/login?return=...`). Deliberately decoupled from `introductions`/bookings — no prior contact required, per the 2026-08-18 decision. `POST /api/favorites` / `DELETE /api/favorites/[cleanerProfileId]`, backed by a new `favorites` table (`customer_id, cleaner_profile_id`, unique pair). `GET /api/cleaners` and `GET /api/cleaners/[slug]` both include a per-row `is_favorited` boolean for the requesting customer (defaults `false` for anyone else). A "My favorites" toggle pill on `/cleaners` (customer-only, next to the results count — not part of `FilterBar`'s own filter state) client-side filters the directory to just favorited cleaners. "Repeat-book same cleaner" from the original ask is satisfied by this same list plus the existing booking flow, not a separate mechanism — favorite a cleaner once, then re-open their card/profile to book again without re-searching.

**Booking a cleaner** — see [§3](#3-the-booking-lifecycle) for the full state machine. In short: request from inside the chat panel (card authorised, not charged) → cleaner has 24h to confirm (charges the card) or decline → job happens → cleaner marks it complete (≥4 photos required) → review prompt appears.

**Cancelling** — either party, from a `REQUESTED` or `CONFIRMED` booking. Full refund if cancelled 24h+ before the scheduled start; no refund inside that window (binary, not prorated).

**Reviewing** — appears inline under a completed booking once, per booking, if no review exists yet. "Skip" is session-local state only — it comes back on reload.

**Disputing a completed job** — `POST /api/disputes`, filed from a "File dispute" action on the completed booking's card in `dashboard/page.tsx`, within a 24-hour window of `completed_at`. One dispute per booking (unique constraint on `booking_id`); confirms to the customer by email with the 24-hour admin SLA (and that an unreviewed case auto-resolves to a full refund — see §7), and alerts admin.

### Cleaner

**Sign up & profile**
1. `/register/cleaner` → same `POST /api/auth/register`, `role: 'CLEANER'` plus `cities[]`, `hourly_rate_eur`, `cleaner_type`. The route immediately creates a **stub `cleaner_profiles` row with `status: 'ACTIVE'`** — the profile is public and bookable from the moment of signup, complete or not.
2. `/dashboard/cleaner/edit` PATCHes `/api/cleaner-profiles/me` against an explicit field allowlist (`display_name, bio, photo_url, cover_photo_url, cities, hourly_rate_eur, cleaner_type, gender, languages, availability`). Profile photo upload is a separate endpoint, fixed path per user (`{user_id}/avatar.jpg`), upserted. **Cover photo was removed from the UI (2026-08-18)** — the card/profile redesign dropped it in favour of a compact, info-first layout; the edit form no longer has an upload control for it and neither card nor profile page render it. `cover_photo_url` is still a live column and the API/allowlist still accept it (harmless, unreachable from the app) — dropping the column itself was left out of scope.
3. The cleaner dashboard nudges profile completion while bio, photo, cities, or weekly availability are missing (availability added to this check 2026-08-18, see below — the nudge is still a banner only, no enforcement blocking the profile from search).
3b. **Weekly availability, mandatory** (added 2026-08-18) — a simple weekly-recurring calendar (Mon–Sun, whole-hour start/end per day, no one-off exceptions in v1) lives in the edit form, folded into the same "complete your profile" flow. Defaults to fully unset (never assumed available), and the edit form's own save validation blocks saving with zero days set (same pattern as the existing cities requirement) — but nothing yet stops an incomplete profile from being bookable; "mandatory" here means the nudge + save-time validation, not a search-visibility gate. Fixed a real bug in the same change: the column previously had two incompatible shapes live at once (edit form wrote a plain string array, every read site expected an object keyed by day-tag) — saved availability silently never displayed or matched the directory filter for any cleaner. See `src/lib/availability.ts` for the shared type/helpers now used by all four read/write sites. Booking-flow enforcement (rejecting a request outside a cleaner's set hours) is not built — flagged as future work, not decided scope for this pass.
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
| — | Request | `REQUESTED` | Customer | `POST /api/bookings`. Validates every field server-side (bedrooms 0–10, bathrooms 1–10, duration 1–12h, address ≤200 chars, date/time not in the past). `service_type` is derived from the cleaner's first offered service, not a form field. Inserts the booking, inserts a matching `payments` row as `PENDING` (card authorised via a Stripe SetupIntent client-side beforehand, **not charged** — `amount_eur` is locked in now at the cleaner's rate plus the flat `BOOKING_FEE_EUR`, see [§4](#4-the-payment-flow)), inserts a `REQUESTED` system message, emails the cleaner. If the payment-row insert fails, the booking insert is rolled back. |
| `REQUESTED` | *(24h passes, no response)* | `CANCELLED` | System (lazy) | **No cron job.** Enforced only on the next `GET /api/bookings` read via `expireOverdueRequests()` — any `REQUESTED` row past its 24h deadline flips to `CANCELLED` and gets a `CANCELLED` system message. The `PATCH` endpoint independently re-checks the same window and returns 409 on a stale confirm/decline attempt. |
| `REQUESTED` | Confirm | `CONFIRMED` | Cleaner only | **The customer is charged here** — an off-session Stripe PaymentIntent against the saved payment method and `stripe_customer_id`, for the full `amount_eur` (rate + fee), into the platform's own Stripe balance. Success → `payments.status = PAID`. Failure → `payments.status = FAILED`, 402 returned with the Stripe error surfaced to the cleaner, booking stays `REQUESTED`. Deliberate design: charging at confirm-time (not completion) discourages late cancellations and avoids ~7-day card-hold expiry on bookings confirmed well in advance. |
| `REQUESTED` | Decline | `CANCELLED` | Cleaner only | Never charged (payment was still `PENDING`), so no refund logic runs. |
| `REQUESTED` or `CONFIRMED` | Cancel | `CANCELLED` | Either party | `cancellation_reason` and `cancelled_by` stamped. If `payments.status === 'PAID'`: full refund if cancelling ≥24h before the scheduled start, otherwise none. A failed refund call is logged, not retried, and does **not** block the cancellation — flagged in-code as needing manual Stripe-dashboard follow-up. |
| `CONFIRMED` | Complete | `COMPLETED` | Cleaner only | Only once the booking's `date` has arrived **and** ≥4 completion photos are uploaded. `review_prompted_at` and cleaner stats are stamped by the `on_booking_completed` DB trigger, never the route. `payments.payout_release_at` is stamped here too (an informational "held until" for the cleaner — see [§4](#4-the-payment-flow)). Customer gets an email. |

**System messages** — every `PATCH` action inserts a chat-thread pill keyed by the *action* (`CONFIRMED`, `DECLINED`, `CANCELLED`, `COMPLETED`), not just the resulting status — `DECLINE` and `CANCEL` both resolve `status` to `CANCELLED` but read differently in chat.

A Stripe webhook does exist (`POST /api/webhooks/stripe`) for the async state a synchronous API response can't cover — see [§4](#4-the-payment-flow).

---

## 4. The payment flow

| Moment | Stripe action | Payment status | Notes |
|---|---|---|---|
| Booking form opens | `SetupIntent` created (`POST /api/stripe/setup-intent`), confirmed client-side by `BookingPaymentElement` | — | Card is authorised/saved, nothing charged |
| Booking requested | — | `PENDING` | `amount_eur = (hourly_rate_eur × duration_hours) + BOOKING_FEE_EUR` — the total the customer pays, locked in at the rate quoted now. `platform_fee_eur` stores the fee portion per-payment (`src/lib/stripe.ts`'s `BOOKING_FEE_EUR`, finalized 2026-08-18 at €0.50, was a €1 placeholder) |
| Cleaner confirms | Off-session `paymentIntents.create({ confirm: true, off_session: true })` against the saved payment method, for the full `amount_eur` | `PAID` on success, `FAILED` on error | **This is the actual charge moment** — not at booking request, not at completion. A plain charge into the *platform's own* Stripe balance — not a Connect destination charge, see the payout section below for why |
| Cleaner declines | — | stays `PENDING` (booking → `CANCELLED`) | Never charged, nothing to refund |
| Either party cancels | `stripe.refunds.create(...)` — **only if** `payments.status === 'PAID'` and cancelling ≥24h before the scheduled start | `REFUNDED` if eligible, otherwise stays `PAID` | No partial/prorated refunds — binary on the 24h line. Refunds the full `amount_eur`, fee included |
| Job completed | — | stays `PAID`; `payout_release_at` stamped | Starts the cleaner payout clock — see below |

**Dispute resolution refund behaviour varies by outcome** (see §6/§7): `CLEANER` triggers no payment action; `UNRESOLVABLE` auto-issues a split refund at the admin-chosen percentage the moment it's resolved; `CUSTOMER` stays a deliberate manual action (an admin clicks "Refund customer" in the queue) **unless** the dispute was auto-resolved on SLA timeout (see below), in which case the full refund is issued automatically, same as `UNRESOLVABLE`.

**Disputes auto-resolve to a full customer refund if unreviewed within 24h** (`disputes.resolve_by`) — see §6. Unlike every other refund path in the app, this one is enforced both by a Vercel Cron (`/api/cron/auto-resolve-disputes`, `src/lib/disputes.ts`) and lazily at the top of `GET /api/admin/disputes`, since a plan-capped cron frequency alone could leave a breach sitting well past its 24h SLA.

### Cleaner payouts (Stripe Connect)

The cleaner is never charged a commission — they keep their full rate; the platform's only revenue is the flat `BOOKING_FEE_EUR`. This is a Connect **"separate charges and transfers"** setup, not a destination charge: the charge above lands entirely in the platform's balance, and the cleaner's cut only moves via a distinct `stripe.transfers.create()` call once their payout is actually due — see `src/lib/payouts.ts`. A destination charge's `application_fee_amount`/`transfer_data.destination` would instead transfer to the cleaner the moment the charge succeeds (at CONFIRM, days before the job happens), which can't be reconciled with holding the payout through the post-completion dispute window.

- **Onboarding** — `POST /api/cleaner-profiles/connect/onboard` creates a Stripe Connect **Express** account for the cleaner (`stripe.accounts.create`, `country: 'CY'`, only the `transfers` capability requested — the connected account never processes a card charge itself, so onboarding only needs identity + bank details, not full payment-processing KYC), then returns a Stripe-hosted Account Link. Any SEPA IBAN works, not specifically a Cypriot bank. This is entirely separate from the `id_photo_url`/`selfie_photo_url` trust-and-safety verification (§2/§7) — a cleaner can have one without the other; they serve different purposes (public trust badge vs. Stripe's own financial KYC gating payouts).
- **Tracking onboarding status** — `cleaner_profiles.stripe_connect_details_submitted`/`stripe_connect_payouts_enabled` mirror Stripe's own `Account.details_submitted`/`payouts_enabled`, kept current by the `account.updated` case in the webhook (`POST /api/webhooks/stripe`) — fires automatically for any Express account this platform created, no separate Connect webhook subscription needed.
- **Payout hold** — a completed booking's payout sits `PENDING` until 24h after `completed_at` with no dispute filed, or until a filed dispute resolves (whichever applies) — deliberately mirrors the 24h dispute filing/resolution SLA (§6) so the two clocks move together: max ~48h from completion to payout-eligible, not a week.
- **Amount** — full rate if no dispute; reduced by the dispute's `refund_percentage` if one was ruled (a 100% customer-favor ruling means the cleaner gets nothing for that job; a 50% split means half). Computed once, at release time, never re-computed after — see `evaluateReadiness()`/`processOneCandidate()` in `src/lib/payouts.ts`.
- **Release** — `releaseDuePayouts()` (`src/lib/payouts.ts`) scans every payment still owed. If the cleaner's Connect account isn't `payouts_enabled` yet, the payout sits `BLOCKED` (amount known, nothing sent) until they finish onboarding — `releaseBlockedPayoutsForCleaner()` is called directly from the `account.updated` webhook case so a backlog releases the moment onboarding completes, not on the next cron tick. Enforced two ways, same reasoning as the dispute auto-resolve job: a Vercel Cron (`/api/cron/release-payouts`, every 15 min) and a lazy check at the top of `GET /api/cleaner-profiles/me/earnings` and `GET /api/admin/users`.
- **Failure** — a failed transfer sets `payout_status = 'FAILED'` (doesn't unwind anything else) and alerts admin by email; also surfaced as a per-cleaner failed-payout count on `/admin/users` (§7) so it can't get lost if the email is missed.
- **Cleaner-facing view** — `/dashboard/cleaner/earnings`: a "set up payouts" prompt if not onboarded (or a "Stripe is reviewing" note if submitted but not yet approved), a held/blocked/paid balance summary, and a per-job list. Reachable as a third desktop tab alongside Bookings/Messages on `/dashboard/cleaner` (`DashboardTabs` supports an `href` tab that navigates instead of switching an in-page panel — added 2026-08-18), and a dashboard banner still links here whenever setup is incomplete or a balance is owed. Mobile has no dedicated nav slot yet (the bottom tab bar is a fixed 5-icon set shared with the customer role) — reachable there only via the banner.
- **Customer-facing breakdown, after booking** — the booking detail modal (dashboard + chat) shows cleaner's rate + booking fee = total whenever a payment is present, reading `payments.amount_eur`/`platform_fee_eur` via `GET /api/bookings`'s `payments` embed.
- **Customer-facing breakdown, before booking** (added 2026-08-18) — `BookingFormModal` shows the same rate/fee/total layout live, before submit, updating as the customer changes duration. Display-only estimate, not trusted: the real charge is still computed server-side at `CONFIRM` from whatever the cleaner's rate is at that moment. The rate + flat fee reach the client via `hourly_rate_eur`/`booking_fee_eur` now included in `GET /api/introductions` (customer branch) and `GET /api/cleaners/[slug]`, threaded through `ChatPanel`/`ChatModal` — `BOOKING_FEE_EUR` itself stays server-only, never imported client-side.

---

## 5. The email map

All templates in `src/lib/email.ts`, sent via Resend. As of 2026-08-18 every customer/cleaner-facing template is both locale-aware (branches its full body on the recipient's actual `users.locale`, not just the subject) and personalized (greets the recipient by name) — this was a real, fixed gap: `sendVerificationEmail`/`sendPasswordResetEmail` used to pick a locale-correct *subject* but hardcode an English *body* regardless, and registration/resend-verification/forgot-password all hardcoded `locale: 'en'` on the call itself rather than reading the user's stored preference. Registration now accepts and stores the customer's/cleaner's current locale from whichever locale-prefixed page they registered on.

| Trigger | Function | Recipient |
|---|---|---|
| Registration | `sendVerificationEmail` | new user |
| "Resend" click | `sendVerificationEmail` | self |
| Forgot password | `sendPasswordResetEmail` | requester |
| First message in a thread (once, ever) | `sendNewMessageEmail` | other party |
| Booking requested | `sendNewBookingRequestEmail` | cleaner |
| Booking confirmed (charge succeeded) | `sendBookingConfirmedEmail` | customer — states the amount charged |
| Booking completed | `sendBookingCompletedEmail` | customer — states the 24h dispute-filing window |
| Booking declined | `sendBookingDeclinedEmail` | customer |
| Booking cancelled (either party) | `sendBookingCancelledEmail` | whichever party didn't act |
| ID verification approved | `sendVerificationApprovedEmail` | cleaner |
| ID verification rejected | `sendVerificationRejectedEmail` | cleaner |
| Dispute filed (confirmation) | `sendDisputeFiledConfirmationEmail` | customer — names which booking, by date |
| Dispute resolved | `sendDisputeResolvedEmail` | both parties, separately — framed as WON/LOST/UNRESOLVABLE from each side; names the booking and, for a customer win, the refund amount |
| Account deleted | `sendAccountDeletedEmail` | the (former) account holder |
| Contact form received | `sendContactSubmissionConfirmationEmail` | submitter — locale comes from the form's own current page locale, since a logged-out submitter has no stored preference |

**Still nothing emails on:** a cleaner responding to a dispute (the admin only sees it on their next queue read, §7/§8) — the "no email on cancellation" and "no email on decline" claims previously here were themselves stale; both already existed.

**Admin-only alerts** (`sendAdminAlertEmail` and everything built on it — refund-failed, payout-failed, new-dispute-filed, new-contact-submission, new-support-message, booking-confirmed-admin-copy) are internal-only and deliberately English-only, no locale branching — a different, intentional design choice, not a gap.

**Every send is best-effort** — wrapped in try/catch at the call site so a Resend outage never fails the booking, verification decision, or any other action it's attached to. There's also a dev/staging escape hatch: if `RESEND_TEST_EMAIL` is set, every email is redirected there regardless of the real recipient, because Resend's sandbox sender silently drops mail to anyone but the account owner until a custom domain is verified.

---

## 6. Known gaps and half-built flows

Ranked by how much is already built behind each gap.

1. **Cleaner ID-verification submission has no entry point.** `cleaner_profiles.id_photo_url`, `selfie_photo_url`, `id_submitted_at` are fully consumed by the admin queue — including the reject-clears-`id_submitted_at`-for-resubmission logic — but nothing in `PATCH /api/cleaner-profiles/me`'s field allowlist, and no dedicated upload route/UI, lets a cleaner set them. A cleaner cannot get themself into the verification queue through the app today.
2. **`schema.sql` undersells the live schema.** A whole table (`verification_tokens`, backing email-verify and password-reset tokens) and several actively-used columns (`cleaner_profiles.cities`, `cleaner_type`, `gender`, `is_mock`) are used throughout the app's API routes but absent from the checked-in schema file. Treat them as real, in-production schema — just undocumented there.
3. **A skipped review prompt doesn't persist.** `skippedReviewIds` is component state on the customer dashboard — reload the page and a skipped prompt reappears.

*(2026-08-18: several stale claims previously listed here or in §4/§10 were confirmed fixed and removed rather than left inaccurate — "filing a dispute has no entry point," "`cleaner_status` `PAUSED`/`SUSPENDED` are unused," "no Stripe webhook," "no idempotency key on confirm" and "a failed refund doesn't alert anyone" all describe an earlier state of the codebase, not the current one. See the "Regenerate FLOWS.md against current code" Todoist task — this doc has drifted in more places than just these.)*

*(2026-08-18: the `chat_notifications` gap previously listed here is now resolved by removal, not by wiring it up — see [§3](#3-the-booking-lifecycle)/messaging notes: it was confirmed to have zero reads or writes anywhere in app code, no RLS policy (so it wasn't even reachable under RLS), and no trigger populating it. Unread state was already fully handled by the live per-request computation in `attachLastMessages()`, and the one-time "new conversation" email alert already runs off `introductions.last_emailed_at` / `support_threads.last_emailed_at` — neither depends on this table. Dropped from `schema.sql`; still needs the corresponding `DROP TABLE chat_notifications;` run manually in the Supabase SQL Editor against the live DB, same as any other schema.sql change.)*

---

## 7. Admin flows

Six tabs under `/admin/**`, all gated to `token.role === 'ADMIN'` by middleware. Nav: `src/components/admin/AdminNav.tsx`.

### Analytics (`/admin/analytics`)
- Added 2026-08-18. Business-visibility, not moderation — deliberately separate from the operational tabs below (verifications/disputes/cancellations/users are all row-listing queues for individual cases; this is the only aggregate/trend view in the admin panel).
- `GET /api/admin/analytics` — a single read-only response: lifetime totals (bookings by status, registered customers, active cleaners, platform revenue), two rate stats (repeat-customer rate, dispute rate + auto-resolve-on-timeout rate), and a 12-week Monday-anchored weekly series (bookings count, revenue) computed in application code from raw `bookings`/`payments` rows — no Postgres aggregation function, no date-range query helper existed anywhere in the codebase before this, so it was written from scratch.
- **Revenue** here means the platform's own cut (`sum(payments.platform_fee_eur)` where `status = 'PAID'`), not gross booking value — recognized at charge time (`CONFIRM`), excluding anything since refunded.
- **Dispute rate** is disputes ÷ completed bookings (a dispute can only be filed on a `COMPLETED` booking, so this is the right denominator, not total bookings).
- Charts are a small hand-rolled CSS bar chart component in the page itself, not a charting library — no such dependency existed in the repo and the data shape (12 weekly buckets, two series) didn't justify adding one.
- v1 scope deliberately excludes the customer/cleaner segmentation views mentioned when this was scoped — those are a larger follow-up, not built here; see the Todoist task for status.

### Verification queue (`/admin`)
- List: `GET /api/admin/verifications` — cleaner profiles where `id_submitted_at is not null and verified = false`, oldest first.
- Detail: a full-screen modal per row — bio, submitted ID photo, selfie, an admin-note textarea.
- Decision: `PATCH /api/admin/verifications/[id]` with `{action: 'APPROVE'|'REJECT', note?}`.
  - **Approve** → `verified = true`, note stored as `verification_note`.
  - **Reject** → `verified` stays `false`, and **clears `id_submitted_at` back to null** so the cleaner could resubmit — this is the only place that field is ever reset, which matters given gap #1 above means there's no resubmission UI either.
  - Either outcome emails the cleaner.

### Dispute resolution (`/admin/disputes`)
- `GET /api/admin/disputes` joins customer, cleaner profile, and booking (including signed completion-photo URLs) — and, before returning, lazily auto-resolves any `OPEN` dispute past its `resolve_by` SLA (see below), so a breach never sits stale just because the cron hasn't ticked yet.
- `PATCH /api/admin/disputes/[id]` with `{resolution: 'CUSTOMER'|'CLEANER'|'UNRESOLVABLE', note?, refund_percentage?}` → stamps `status = 'RESOLVED'`, `resolved_at`, `admin_note`. Both resolved and still-open disputes remain visible in the list.
  - `CLEANER` → no refund.
  - `CUSTOMER` → no automatic refund; a "Refund customer" button appears in the detail view for the admin to trigger manually.
  - `UNRESOLVABLE` (a neutral split decision) → auto-issues a Stripe refund immediately at the admin-chosen percentage (default 50%). On success, `payments.status → REFUNDED` and `refunded_at` is stamped, same as a cancellation refund (fixed 2026-08-18 — this previously left `payments.status` at `PAID` on a successful split refund, so the money moved but the row didn't reflect it). A failed refund doesn't unwind the ruling — `payments.status → REFUND_FAILED` and an admin alert email fires instead.
- Emails both parties, same note, framed as won/lost from each one's own side (`UNRESOLVABLE` gets its own neutral framing).
- **Filing window & resolution SLA: 24h/24h** (`src/app/api/disputes/route.ts`'s `FILING_WINDOW_MS`/`RESOLUTION_SLA_MS`) — a customer has 24h from `booking.completed_at` to file, and `disputes.resolve_by` (stamped `created_at + 24h` on filing) is the admin SLA shown as a countdown/overdue badge in the queue.
- **Auto-resolve on SLA timeout** (`src/lib/disputes.ts`'s `autoResolveOverdueDisputes()`, triggered by `/api/cron/auto-resolve-disputes` — Vercel Cron, `vercel.json` — and lazily by the `GET` above): any `OPEN` dispute past `resolve_by` is force-resolved as `CUSTOMER`/100% refund, `disputes.auto_resolved = true`, and the Stripe refund is issued automatically (full refund, same call shape as a cancellation refund — sets `payments.status → REFUNDED` on success, `REFUND_FAILED` + admin alert on failure). Both parties get the standard resolved email, but with a note explaining it was a timeout default, not a considered ruling. The queue badges these distinctly ("Auto-resolved — SLA timeout") from an admin's own `CUSTOMER` ruling.
- **Per-customer dispute/refund history** — `/admin/users` shows, inline on each customer's card, "N disputes filed — X auto-resolved, Y admin-resolved" whenever a customer has ≥1 dispute (`GET /api/admin/users` aggregates the `disputes` table by `customer_id`). This is the safety net for the auto-refund-on-timeout policy: a customer repeatedly filing and waiting out the clock for a free refund is visible to admin without a separate query, though nothing currently acts on the pattern automatically (flagging/restricting a repeat customer is still a manual admin judgment call).

### Cancellations (`/admin/cancellations`)
- `GET /api/admin/cancellations` lists every `CANCELLED` booking that has a `cancellation_reason`, joined with who cancelled it and the payment's refund state.
- Purely a visibility tool — refund eligibility was already decided automatically at cancel-time (§3); there's no action to take here.
- Badge states: not-charged / refunded / charged-not-refunded / charge-failed.

### Users (`/admin/users`)
- `GET /api/admin/users` — every registered account, searchable by name/email. Cleaners get Pause/Suspend/Reactivate actions (`PATCH /api/admin/users/[id]`, sets `cleaner_profiles.status`); customers have no actions here.
- Doc note: this tab already existed before Messages was added below — "no user-management screen" was a stale claim, corrected here.
- Also runs the dispute auto-resolve and payout-release lazy checks (same as the queues that own each) before returning, and inlines two per-user aggregates read nowhere else in the UI: a customer's dispute/refund history (§6/§7, "N disputes filed — X auto-resolved, Y admin-resolved") and a cleaner's failed-payout count (§4) — both exist so a pattern needing attention is visible without a separate query.

### Messages (`/admin/messages`)
- One inbox merging two different underlying things, sorted by most recent activity: `support_threads` (a customer/cleaner talking to admin directly, live chat) and `contact_submissions` (the logged-out-friendly contact form, async, no ongoing thread). `GET /api/support/threads` (as ADMIN, returns every thread) + `GET /api/admin/contact`, merged and sorted client-side — not one combined API.
- Support chat reuses the `introductions`/`messages` machinery rather than a second parallel system: `messages.support_thread_id` is a nullable FK sibling to `messages.introduction_id` (exactly one of the two is ever set, enforced by a check constraint), same Realtime-via-Postgres-changes pattern, same `/api/messages` GET/POST endpoints branching on which id is provided. `SupportChatPanel` is a trimmed sibling of `ChatPanel` — no booking-request UI, since a support thread has no booking to nudge.
- A user starts a thread via "Contact support" on `/dashboard/profile` (`POST /api/support/threads`, find-or-create against their own most recent `OPEN` thread — not admin-initiated). Admin replies from the inbox; either side's messages are visible to the thread's owner and to any admin (RLS: `support_threads_own_or_admin`, `messages_own_thread` extended to cover the support-thread branch).
- Notifications: the thread owner's first message triggers a one-time email alert to `ADMIN_EMAIL` (`sendSupportMessageAlertEmail`, same `last_emailed_at`-gated pattern as introductions) — not per-message, and not the reverse: an admin's reply doesn't email the user back (relies on Realtime while they're in the app; not built as a v1 tradeoff, not because it's undesirable).
- Admin can toggle a thread `OPEN ⇄ CLOSED` (`PATCH /api/support/threads/[id]`) and a contact submission resolved/unresolved (`PATCH /api/admin/contact/[id]`) — both toggle rather than one-way, so a mistaken close/resolve has a way back.
- Not built: the admin thread *list* doesn't live-update on a brand-new incoming thread — only messages inside an already-open thread are Realtime. A new thread needs a page reload to appear (or the email alert prompts admin to go look).

### What the schema suggests but the admin panel doesn't have
- No admin view onto `payments` directly (only surfaced indirectly through the cancellations ledger) — a `FAILED` or stuck `PENDING` payment outside a cancellation context has no admin-facing list.

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
| Admin approves/rejects verification | Cleaner gets an email either way; on approval, a verified badge appears on their public profile immediately | Nothing further, or resubmit (gap #1 — no way to actually do so) |
| Admin resolves a dispute | Both customer and cleaner get separate emails, each framed as won/lost from their own side | Nothing further — no appeal flow |
| Cleaner responds to a dispute | Nothing notifies the admin proactively — it just appears in the next `GET /api/admin/disputes` read | Admin can now see the response when they next open the queue |
| Customer/cleaner sends the first message in a new support thread | Admin gets a one-time email alert (`ADMIN_EMAIL`); thread appears in `/admin/messages` on next load (not live) | Reply from the unified inbox, or mark resolved |
| Admin replies in a support thread | User sees it live via Realtime if the chat is open, otherwise on next visit — no email sent | Reply, or the thread stays open until either side closes it |

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
- **Post-login redirect**: `login/page.tsx` fetches the session after `signIn()` and routes by role — `CLEANER → /dashboard/cleaner`, `ADMIN → /admin`, else `safeReturnPath(searchParams.get('return')) ?? /dashboard` for a CUSTOMER, honoring a same-origin `?return=` set by e.g. `cleaners/[slug]/page.tsx` when it bounced an anonymous visitor to log in.
- **RLS as a second line of defense**: almost every API route uses the service-role admin client and enforces authorization manually (session + row-ownership checks) inside the handler — RLS mainly matters for the few paths where the browser client talks to Supabase directly. Notable RLS specifics: `cleaner_profiles` are publicly selectable only where `status = 'ACTIVE'` (plus the owner can always see their own row); `introductions`/`messages` are visible only to the thread's two parties; `payments` and `disputes` have RLS enabled with **no policies at all**, by design — they're only ever touched via the admin client.
- **Self-service account deletion** — entry point on `/dashboard/profile` (type-`DELETE`-to-confirm modal), `DELETE /api/user/me`. Anonymizes rather than hard-deletes: `users.deleted_at` is stamped and `full_name`/`email`/`phone`/`avatar_url`/`stripe_customer_id`/`password_hash` are overwritten (bookings/payments/reviews/disputes keep their FK, so the transaction trail survives under a "Deleted user" placeholder); saved `addresses` rows are deleted outright. For a `CLEANER`, `cleaner_profiles` gets the same anonymize treatment plus `status → 'SUSPENDED'` (drops out of the public `ACTIVE`-only listing/RLS), and `id_photo_url`/`selfie_photo_url`/profile photos are actually removed from storage, not just nulled. Blocked with a 409 (not deleted) while the account has: a `REQUESTED`/`CONFIRMED` booking, an `OPEN` dispute, or a booking with a `REFUND_FAILED` payment — resolve those first. `authorize()` in `config.ts` treats `deleted_at != null` the same as "no such user" (anti-enumeration, same as every other auth failure). No scheduled retention window before anonymization (e.g. a 30-day undo grace period) — runs immediately; deferred pending the actual legal retention requirement from the entity/tax advisor.

---

## 10. Edge cases and race conditions

- **Booking confirm/decline/cancel's check-then-act race is guarded twice over — this was stale here as a live gap; confirmed fixed while auditing adjacent code for the Stripe Connect payout work (2026-08-18).** `PATCH /api/bookings/[id]` validates the requested transition against the `status` it just read, then writes with `.update(...).eq('id', params.id).eq('status', booking.status)` — the second `.eq` means a losing concurrent request affects zero rows and gets a clean 409, not a clobber. `CONFIRM`'s Stripe call additionally passes `idempotencyKey: 'confirm-${booking.id}'`, so even if two requests somehow both reached `paymentIntents.create`, Stripe itself would return the same PaymentIntent to both rather than charging twice. Covered by `confirm-concurrency.integration.test.ts`.
- **Booking expiry is lazy, not scheduled.** A `REQUESTED` booking past its 24h window doesn't flip to `CANCELLED` until *something* triggers a `GET /api/bookings` (either party loading their dashboard) or a `PATCH` attempt re-checks the window. If neither party opens the app, an expired-in-spirit booking can sit as `REQUESTED` indefinitely in the database, and its payment row stays `PENDING` (never charged, since `CONFIRM` independently re-validates the window and will refuse a stale confirm with a 409).
- **A cleaner going `PAUSED`/`SUSPENDED` mid-booking triggers no automatic cancellation or customer notification.** Admin can set either state today (`/admin/users`, `PATCH /api/admin/users/[id]`), but grepping the booking flow for any `cleaner_profiles.status` check turns up none — an in-flight `REQUESTED`/`CONFIRMED` booking with that cleaner just sits there unaffected.
- **Introduction (thread) creation race is handled explicitly.** `POST /api/introductions` (`introductions/route.ts:91-115`) catches Postgres `23505` (unique-violation on `customer_id, cleaner_profile_id`) from two concurrent "start chat" clicks and re-fetches the winning row instead of erroring — one of the few places in the codebase with an explicit concurrency guard.
- **Payment-row insert failing after the booking insert succeeds is handled by explicit rollback** (`bookings/route.ts:195-198`) — the booking row is deleted if the `payments` insert fails, so a booking can't exist without a corresponding payment row. The reverse isn't possible by construction (payment insert only runs after a successful booking insert).
- **A failed refund on cancellation does alert admin and is flagged distinctly — also stale here, confirmed fixed same pass as above.** `payments.status → REFUND_FAILED` (not left `PAID`) and `sendRefundFailedAlertEmail` fires immediately, in addition to the admin cancellations ledger's badge and the manual retry endpoint (`POST /api/admin/cancellations/[id]/retry-refund`). The same pattern (status flip + admin alert + manual retry) is reused for the dispute auto-resolve refund (§6) and the cleaner payout transfer (§4) — see `refund-failure-recovery.integration.test.ts`.
- **Email failures never block the action they're attached to** — every email call site across the app is wrapped in its own try/catch with the error only logged, consistent with the "best-effort" framing in §5. There's no retry queue; a Resend outage at the exact moment of a booking confirmation means that email is simply lost.
- **Review submission race**: `POST /api/reviews` both pre-checks for an existing review and relies on a DB-level unique constraint on `booking_id` as the actual guard (`reviews/route.ts:43-51`) — two near-simultaneous submissions for the same booking would have the second one fail at the DB constraint rather than silently duplicate.
- **Duplicate dispute-response submission is blocked by status, not a lock** — `PATCH /api/cleaner/disputes/[id]` rejects if `status !== 'OPEN'`, but since resolution requires an admin action in between, this isn't a tight race window in practice.
- **Payout release has the same double-guard as booking confirm.** `releaseDuePayouts()`/`releaseBlockedPayoutsForCleaner()` (`src/lib/payouts.ts`) can both run concurrently (cron + a lazy check landing at the same moment) — the eventual `payments` update is guarded on `.eq('payout_status', row.payout_status)` (a losing write affects zero rows), and the Stripe transfer itself carries `idempotencyKey: 'payout-${booking.id}'`, so even a genuine double-attempt returns the same Transfer rather than paying twice.

---

## 11. Data model reference

Authoritative schema: `supabase/schema.sql`. TS mirror: `src/types/index.ts`.

### Enums (`schema.sql:11-16`, `types/index.ts:1-16`)
- `user_role`: `CUSTOMER | CLEANER | ADMIN`
- `cleaner_status`: `ACTIVE | PAUSED | SUSPENDED` (only `ACTIVE` is used anywhere in app code — `PAUSED`/`SUSPENDED` have no booking-flow effect, see §10)
- `service_type`: `HOUSE | APARTMENT`
- `booking_status`: `REQUESTED → CONFIRMED → COMPLETED`, or `→ CANCELLED` from either of the first two
- `payment_status`: `PENDING | PAID | REFUNDED | FAILED | REFUND_FAILED` (the last is a Stripe refund call itself erroring — see §10)
- `cleaning_type`: `STANDARD | DEEP`
- `dispute_status`: `OPEN | RESOLVED`
- `dispute_resolution`: `CUSTOMER | CLEANER | UNRESOLVABLE` (who the admin ruled for; `UNRESOLVABLE` is a neutral split decision, not a finding against either party — see §7). `disputes.auto_resolved` (not an enum, a plain boolean) separately flags a `CUSTOMER` resolution that was forced by SLA timeout rather than an actual admin ruling.
- `payout_status`: `PENDING | BLOCKED | PAID | FAILED` — a cleaner's payout for one booking; see §4's payout section for what each means and `payments.cleaner_payout_eur`/`platform_fee_eur`/`payout_release_at`/`stripe_transfer_id`/`paid_out_at` for the amount/timing columns it travels with.

### Triggers — never replicate this logic in application code
- `on_review_insert` → `update_cleaner_stats()`: recomputes `avg_rating`, `review_count` (from `reviews`) and `unique_customer_count`, `total_jobs_count` (from `COMPLETED` `bookings`) on the cleaner's profile, fired on every review insert.
- `on_booking_status_change` (BEFORE UPDATE) → `on_booking_completed()`: when `status` transitions to `COMPLETED`, stamps `review_prompted_at = now()` and increments `total_jobs_count` / recomputes `unique_customer_count` on the cleaner profile.

### RLS by table
- `users`: select/update own row only.
- `addresses`: select/insert/delete own rows only (no update policy — client does delete+re-add).
- `cleaner_profiles`: public select where `status='ACTIVE'`, plus the owner can always select their own row regardless of status.
- `introductions`, `messages`: visible only to the two thread parties.
- `reviews`: public select; no insert/update policy for anon/authenticated roles (writes go through the admin client from `/api/reviews`).
- `payments`, `disputes`: RLS enabled with **no policies at all**, by design — both are only ever touched via the service-role admin client, never the anon-key browser client.
- `support_threads`: owner or any admin. `messages_own_thread` extends the same rule to the support-thread branch.

### `schema.sql` undersells the live schema
A whole table and several actively-used columns are used throughout the app's API routes but absent from the checked-in `schema.sql` — treat them as real, in-production schema, just undocumented there:

| Used in code | Not in schema.sql |
|---|---|
| `verification_tokens` table (email verify / password reset tokens) — `api/auth/register/route.ts:97`, `verify-email/route.ts:13`, `forgot-password/route.ts:32`, `reset-password/route.ts:18`, `resend-verification/route.ts:31` | entire table missing |
| `cleaner_profiles.cities` (text array, plural) — used everywhere instead of the singular `city` column schema.sql defines | not in schema.sql |
| `cleaner_profiles.cleaner_type` (`'individual' \| 'company'`) — `dashboard/cleaner/edit/page.tsx:44` | not in schema.sql (schema has `is_company boolean` instead, now only a legacy read-fallback, see `cleaners/page.tsx:64`) |
| `cleaner_profiles.gender` (`'female' \| 'male' \| null`) | not in schema.sql |
| `cleaner_profiles.is_mock` (boolean) — `api/cleaners/route.ts:16` | not in schema.sql |
| `users.locale` — actively read (e.g. `admin/disputes/[id]/route.ts:70`) | schema.sql *does* define this one, just noting it's live |

If you're changing schema, reconcile this drift rather than assuming `schema.sql` is complete.
