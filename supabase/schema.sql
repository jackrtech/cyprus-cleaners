-- ============================================================
-- Cyprus Cleaners — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── ENUMS ───────────────────────────────────────────────────

create type user_role as enum ('CUSTOMER', 'CLEANER', 'ADMIN');
create type cleaner_status as enum ('ACTIVE', 'PAUSED', 'SUSPENDED');
create type service_type as enum ('HOUSE', 'APARTMENT');
create type booking_status as enum ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
create type cleaning_type as enum ('STANDARD', 'DEEP', 'MOVE_IN_OUT');
-- MOVE_IN_OUT added 2026-08-19 as part of service tiers v1 (see
-- cleaner_service_offerings below). Applying to an existing database (this
-- file is bootstrap-only, not re-run): `alter type cleaning_type add value 'MOVE_IN_OUT';`
create type locale_type as enum ('en', 'el');

-- ─── USERS ───────────────────────────────────────────────────

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  password_hash     text not null,
  role              user_role not null default 'CUSTOMER',
  full_name         text not null,
  phone             text,
  phone_verified    boolean not null default false,
  email_verified    boolean not null default false,
  avatar_url        text,
  locale            locale_type not null default 'en',
  stripe_customer_id text,
  deleted_at        timestamptz,  -- self-service account deletion (GDPR erasure): set instead of a hard delete so bookings/payments/reviews/disputes keep a valid FK — full_name/email/phone/avatar_url/stripe_customer_id are overwritten with anonymized placeholders at the same time, password_hash is scrambled so the account can never be signed into again. NULL means active. Applying to an existing database: `alter table users add column deleted_at timestamptz;`
  created_at        timestamptz not null default now()
);

create index idx_users_email on users (email);
create index idx_users_role  on users (role);

-- ─── VERIFICATION TOKENS ─────────────────────────────────────
-- Backs email-verification and password-reset links. Only ever read/written
-- via the service-role admin client, same as payments/disputes below — RLS
-- is enabled purely to deny by default, no policies needed.

create table verification_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token       text not null unique,
  type        text not null check (type in ('EMAIL_VERIFY', 'PASSWORD_RESET')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index verification_tokens_token_idx   on verification_tokens (token);
create index verification_tokens_user_id_idx on verification_tokens (user_id);

-- ─── CLEANER PROFILES ────────────────────────────────────────

create table cleaner_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references users(id) on delete cascade,
  slug                  text unique not null,
  display_name          text not null,
  bio                   text not null default '',
  bio_el                text,
  photo_url             text,
  cover_photo_url       text,
  city                  text not null,
  neighbourhoods        text[] not null default '{}',
  hourly_rate_eur       numeric(6,2) not null,
  services              service_type[] not null default '{}',
  languages             text[] not null default '{}',
  has_transport         boolean not null default false,
  is_company            boolean not null default false,
  cleaner_type          text default 'individual',  -- 'individual' | 'company', validated in application code (no DB check constraint)
  gender                text,  -- optional; used only to render grammatically correct Greek copy
  cities                text[] default '{}',  -- cleaner's serviced cities; `city` above is kept for existing single-city callers
  is_mock               boolean not null default false,  -- seeded demo profile, not a real signup
  -- Applying to an existing database: `alter table cleaner_profiles add column cleaner_type text default 'individual', add column gender text, add column cities text[] default '{}', add column is_mock boolean not null default false;`
  -- Trust & verification
  verified              boolean not null default false,
  id_submitted_at       timestamptz,
  id_photo_url          text,  -- storage PATH (not URL) in the private 'id-documents' bucket — nulled once admin decides, whether approved or rejected, since the document is deleted from storage at that point
  selfie_photo_url      text,  -- storage PATH in 'id-documents' — same lifecycle as id_photo_url
  verification_note     text,  -- Admin's note from the last approve/reject decision
  verification_status   verification_status,  -- null = never submitted; PENDING while awaiting review; APPROVED/REJECTED after a decision. Kept separate from `verified` (which drives the public badge and predates this column) so the cleaner dashboard can distinguish REJECTED from never-submitted.
  status                cleaner_status not null default 'ACTIVE',
  -- Stripe Connect (payouts) — separate from the id_photo_url/selfie_photo_url
  -- trust-and-safety verification above: this is Stripe's own financial KYC,
  -- gating payouts specifically, not the public verified badge. A cleaner can
  -- be `verified` (badge) with no Connect account, or Connect-onboarded with
  -- no badge — the two are unrelated.
  stripe_connect_account_id       text,
  stripe_connect_details_submitted boolean not null default false,
  stripe_connect_payouts_enabled   boolean not null default false,  -- mirrors Stripe's own Account.payouts_enabled; kept via the account.updated webhook, never polled
  -- Applying to an existing database: `alter table cleaner_profiles add column stripe_connect_account_id text, add column stripe_connect_details_submitted boolean not null default false, add column stripe_connect_payouts_enabled boolean not null default false;`
  -- Denormalised stats (updated by triggers)
  avg_rating            numeric(3,2) not null default 0,
  review_count          int not null default 0,
  unique_customer_count int not null default 0,
  total_jobs_count      int not null default 0,
  -- Weekly recurring availability, whole hours (24h clock). A day key is
  -- present only when the cleaner is available that day; absent = not
  -- available. Mandatory (nudged via the profile-completion banner, folded
  -- in 2026-08-18) — never assume availability the cleaner hasn't set.
  -- See src/lib/availability.ts for the shared type + helpers.
  -- e.g. {"mon": {"start": 9, "end": 17}, "wed": {"start": 9, "end": 17}}
  availability          jsonb,
  created_at            timestamptz not null default now()
);

create index idx_cleaner_city     on cleaner_profiles (city);
create index idx_cleaner_status   on cleaner_profiles (status);
create index idx_cleaner_verified on cleaner_profiles (verified);
create index idx_cleaner_rating   on cleaner_profiles (avg_rating desc);
create index idx_cleaner_services on cleaner_profiles using gin (services);
create index idx_cleaner_connect_account on cleaner_profiles (stripe_connect_account_id);  -- backs the account.updated webhook's lookup

-- ─── CLEANER SERVICE OFFERINGS ───────────────────────────────
-- Per-cleaner opt-in menu of paid tiers/add-ons beyond the baseline STANDARD
-- tier (STANDARD's rate is cleaner_profiles.hourly_rate_eur — always
-- available, never a row here). One row = "this cleaner offers `code` at
-- `price_eur`"; absence of a row = not offered. `code`'s fixed v1 set spans
-- both opt-in tiers (DEEP, MOVE_IN_OUT — priced €/hr, same unit as
-- hourly_rate_eur) and add-ons (CARPET, OVEN — priced flat €/booking) in one
-- table rather than two, since both share an identical shape and every
-- consumer treats them alike; which codes are tiers vs. add-ons is kept in
-- src/lib/serviceOfferings.ts (one source of truth), not a DB column.

create table cleaner_service_offerings (
  id                  uuid primary key default gen_random_uuid(),
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  code                text not null check (code in ('DEEP', 'MOVE_IN_OUT', 'CARPET', 'OVEN')),
  price_eur           numeric(6,2) not null check (price_eur > 0),
  created_at          timestamptz not null default now(),
  unique (cleaner_profile_id, code)
);

create index idx_offerings_cleaner on cleaner_service_offerings (cleaner_profile_id);

alter table cleaner_service_offerings enable row level security;

-- Same shape as cleaner_profiles' own two select policies, joined through it
-- since ownership here is cleaner_profiles.user_id, not a direct column. No
-- insert/update/delete policies, same as cleaner_profiles itself — all
-- writes go through the admin client in /api/cleaner-profiles/me/offerings.
create policy "cleaner_offerings_public_read" on cleaner_service_offerings
  for select using (
    exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.status = 'ACTIVE')
  );
create policy "cleaner_offerings_select_own" on cleaner_service_offerings
  for select using (
    auth.uid()::text = (select user_id::text from cleaner_profiles where id = cleaner_profile_id)
  );
-- Applying to an existing database:
-- `create table cleaner_service_offerings (id uuid primary key default gen_random_uuid(), cleaner_profile_id uuid not null references cleaner_profiles(id) on delete cascade, code text not null check (code in ('DEEP','MOVE_IN_OUT','CARPET','OVEN')), price_eur numeric(6,2) not null check (price_eur > 0), created_at timestamptz not null default now(), unique (cleaner_profile_id, code));
--  create index idx_offerings_cleaner on cleaner_service_offerings (cleaner_profile_id);
--  alter table cleaner_service_offerings enable row level security;
--  create policy "cleaner_offerings_public_read" on cleaner_service_offerings for select using (exists (select 1 from cleaner_profiles cp where cp.id = cleaner_profile_id and cp.status = 'ACTIVE'));
--  create policy "cleaner_offerings_select_own" on cleaner_service_offerings for select using (auth.uid()::text = (select user_id::text from cleaner_profiles where id = cleaner_profile_id));`

-- ─── INTRODUCTIONS ───────────────────────────────────────────
-- One messaging thread per customer/cleaner pair — no approval gate,
-- messages and bookings hang off this record's id.

create table introductions (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  last_emailed_at     timestamptz,
  created_at          timestamptz not null default now(),
  -- One thread per customer-cleaner pair
  unique (customer_id, cleaner_profile_id)
);

create index idx_intros_customer on introductions (customer_id);
create index idx_intros_cleaner  on introductions (cleaner_profile_id);

-- ─── FAVORITES ───────────────────────────────────────────────
-- A customer shortlisting a cleaner while browsing — deliberately decoupled
-- from `introductions` (favoriting needs no prior chat/booking, per the
-- 2026-08-18 decision: "no prior booking required"). "Repeat-book same
-- cleaner" reuses this list plus the existing booking-creation flow rather
-- than its own mechanism — see FLOWS.md.

create table favorites (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  -- A cleaner can only be favorited once per customer
  unique (customer_id, cleaner_profile_id)
);

create index idx_favorites_customer on favorites (customer_id);
create index idx_favorites_cleaner  on favorites (cleaner_profile_id);

-- ─── BOOKINGS ────────────────────────────────────────────────

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  introduction_id     uuid not null references introductions(id) on delete restrict,
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  service_type        service_type not null,
  bedrooms            int,
  bathrooms           int,
  cleaning_type       cleaning_type,
  date                date not null,
  start_time          time not null,
  duration_hours      numeric(4,2),  -- Set by the cleaner on CONFIRM, not by the customer on request
  notes               text,
  address             text,  -- Free-text property address for this job; nullable so pre-existing bookings aren't broken
  address_lat         numeric(9,6),  -- Snapshot of the selected address's map pin at request time, same rationale as `address` itself
  address_lng         numeric(9,6),
  finding_us_notes    text,  -- Snapshot of the selected address's finding-us notes at request time. Applying address_lat/address_lng/finding_us_notes to an existing database: `alter table bookings add column address_lat numeric(9,6), add column address_lng numeric(9,6), add column finding_us_notes text;`
  photo_paths         text[] not null default '{}',  -- Private storage paths in 'booking-photos' bucket; signed URLs generated at read time
  addon_codes         text[] not null default '{}',  -- Which CARPET/OVEN add-ons (see cleaner_service_offerings below) were selected on this booking, snapshotted as codes — same array-column shape as photo_paths. Validated against the canonical list server-side (src/lib/serviceOfferings.ts) at request time, not DB-constrained, to avoid keeping the fixed code list in two places. Applying to an existing database: `alter table bookings add column addon_codes text[] not null default '{}';`
  status              booking_status not null default 'REQUESTED',
  review_prompted_at  timestamptz,  -- Set when status → COMPLETED; triggers review prompt
  completed_at        timestamptz,  -- Set when status → COMPLETED; anchors the 24h customer dispute-filing window (src/app/api/disputes/route.ts) and the cleaner payout hold (src/lib/payouts.ts). Applying to an existing database: `alter table bookings add column completed_at timestamptz;`
  cancellation_reason text,  -- Free-text reason, set on CANCEL/DECLINE
  cancelled_by        uuid references users(id),  -- Who initiated the cancellation
  review_skipped_at   timestamptz,  -- Customer dismissed the review prompt; suppresses it going forward instead of re-showing on every reload. Applying to an existing database: `alter table bookings add column review_skipped_at timestamptz;`
  created_at          timestamptz not null default now()
);

create index idx_bookings_customer on bookings (customer_id);
create index idx_bookings_cleaner  on bookings (cleaner_profile_id);
create index idx_bookings_status   on bookings (status);
create index idx_bookings_date     on bookings (date);

-- ─── PAYMENTS ────────────────────────────────────────────────
-- One row per booking. The customer is charged in full when the cleaner
-- confirms the booking (not on completion) — deliberate choice to discourage
-- last-minute cancellations, and it sidesteps card auth holds expiring
-- (~7 days) for bookings confirmed well ahead of the job date.
--
-- `amount_eur` is the TOTAL charged to the customer: the cleaner's
-- (hourly_rate_eur × duration_hours) plus a flat platform booking fee
-- (`platform_fee_eur`, BOOKING_FEE_EUR in src/lib/stripe.ts — €0.50) —
-- this is a Connect "separate charges and transfers" setup, not a
-- destination charge: the charge itself is a plain platform-account charge
-- (as before Connect existed), and the cleaner's cut only moves as a
-- separate stripe.transfers.create() call once the payout hold clears (see
-- src/lib/payouts.ts) — a destination charge's automatic transfer would
-- instead pay the cleaner the moment the charge succeeds (at CONFIRM,
-- days before the job happens), which is incompatible with holding the
-- payout through the post-completion dispute window.

create type payment_status as enum ('PENDING', 'PAID', 'REFUNDED', 'FAILED', 'REFUND_FAILED');
-- REFUND_FAILED: the Stripe refund call itself errored after a CANCEL — the
-- booking is CANCELLED but the customer was never actually refunded. Needs a
-- manual retry from the admin cancellations ledger. Applying to an existing
-- database (this file is bootstrap-only, not re-run): `alter type payment_status add value 'REFUND_FAILED';`
create type verification_status as enum ('PENDING', 'APPROVED', 'REJECTED');
-- Applying to an existing database: `create type verification_status as enum ('PENDING', 'APPROVED', 'REJECTED');`
-- then `alter table cleaner_profiles add column verification_status verification_status;`
create type payout_status as enum ('PENDING', 'BLOCKED', 'PAID', 'FAILED');
-- PENDING: booking not yet COMPLETED, or completed but still inside the
--   post-completion hold window / an open dispute. BLOCKED: hold has
--   cleared and a payout amount is known, but the cleaner hasn't finished
--   Stripe Connect onboarding yet — queued, released the moment they do
--   (see the account.updated webhook case). PAID: transferred (or nothing
--   was owed — e.g. a fully-refunded dispute — cleaner_payout_eur is 0 in
--   that case, distinguishable in the UI by the amount, not the status).
--   FAILED: the transfer attempt itself errored — needs manual retry,
--   mirrors REFUND_FAILED's admin-alert-and-retry pattern.

create table payments (
  id                          uuid primary key default gen_random_uuid(),
  booking_id                  uuid not null unique references bookings(id) on delete cascade,
  amount_eur                  numeric(10,2) not null,
  status                      payment_status not null default 'PENDING',
  provider                    text not null default 'stripe',
  provider_payment_intent_id  text,
  provider_payment_method_id  text,  -- saved off-session, at booking request time
  paid_at                     timestamptz,
  refunded_at                 timestamptz,
  -- Cleaner payout (see the block comment above this table)
  platform_fee_eur            numeric(6,2),   -- the flat fee portion of amount_eur, stored per-payment (not read from the constant later) so a future fee change never rewrites history
  tier_rate_eur                numeric(6,2),   -- the €/hr tier rate actually used (STANDARD's cleaner_profiles.hourly_rate_eur, or the cleaner's DEEP/MOVE_IN_OUT rate from cleaner_service_offerings) at REQUEST time — snapshotted per-payment for the same reason as platform_fee_eur: a cleaner's later rate change must never rewrite a past booking's breakdown.
  addon_total_eur              numeric(6,2) not null default 0,  -- sum of the flat add-on prices selected (bookings.addon_codes), snapshotted at the same time, same reason.
  cleaner_payout_eur          numeric(10,2),  -- null until the payout-release job decides the final figure; only then is it the cleaner's rate, or less if a dispute ruling reduced it
  payout_status                payout_status not null default 'PENDING',
  payout_release_at           timestamptz,    -- informational "held until" for the cleaner-facing UI; the release job re-derives eligibility live rather than trusting this as authoritative
  stripe_transfer_id          text,
  paid_out_at                 timestamptz,
  created_at                  timestamptz not null default now()
);
-- Applying platform_fee_eur/cleaner_payout_eur/payout_status/payout_release_at/stripe_transfer_id/paid_out_at
-- to an existing database:
-- `alter table payments add column platform_fee_eur numeric(6,2), add column cleaner_payout_eur numeric(10,2), add column payout_status payout_status not null default 'PENDING', add column payout_release_at timestamptz, add column stripe_transfer_id text, add column paid_out_at timestamptz;`
-- Then backfill existing rows — under the pre-Connect model the whole
-- charged amount was the cleaner's earning, no fee taken:
-- `update payments set platform_fee_eur = 0, cleaner_payout_eur = amount_eur where platform_fee_eur is null;`
-- Applying tier_rate_eur/addon_total_eur to an existing database:
-- `alter table payments add column tier_rate_eur numeric(6,2), add column addon_total_eur numeric(6,2) not null default 0;`

create index idx_payments_status on payments (status);
create index idx_payments_payout_status on payments (payout_status) where payout_status in ('PENDING', 'BLOCKED');  -- backs the payout-release job's due/blocked lookup

-- ─── ADDRESSES ───────────────────────────────────────────────
-- A customer's saved addresses, offered as a picker on the booking form.
-- Bookings store a free-text snapshot of whichever address was selected
-- (see bookings.address) rather than a FK, so editing/deleting a saved
-- address here never rewrites a past booking's record.

create table addresses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  label              text,  -- optional friendly name, e.g. "Home", "Office"
  line1              text not null,  -- street + number
  city               text not null,  -- one of the fixed CITIES list — kept for cleaner service-area matching
  area               text,  -- free-text village/neighbourhood beyond the fixed city list, e.g. "Pyrgos", "Geroskipou"
  postal_code        text,
  lat                numeric(9,6),  -- map pin, both null until the customer drops one
  lng                numeric(9,6),
  finding_us_notes   text,  -- free-text help finding the property, e.g. "blue gate, park on the street"
  is_default         boolean not null default false,  -- at most one true per user, enforced in application code (see POST /api/addresses/[id]/default) rather than a DB constraint, since "at most one" per user needs a partial unique index — simpler to own it in the one place that ever sets it. Applying to an existing database: `alter table addresses add column is_default boolean not null default false;`
  created_at         timestamptz not null default now()
);
-- Applying area/lat/lng/finding_us_notes to an existing database:
-- `alter table addresses add column area text, add column lat numeric(9,6), add column lng numeric(9,6), add column finding_us_notes text;`

create index idx_addresses_user on addresses (user_id);

-- ─── SUPPORT THREADS ─────────────────────────────────────────
-- A customer/cleaner talking to admin directly — distinct from an
-- `introductions` thread (a specific customer paired with a specific
-- cleaner_profile). One user can have more than one row here over time
-- (no unique constraint on user_id) but the API only ever finds-or-creates
-- against the most recent OPEN one, closing a thread starts a fresh one on
-- the next message rather than reopening old history.

create type support_thread_status as enum ('OPEN', 'CLOSED');

create table support_threads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  status           support_thread_status not null default 'OPEN',
  last_emailed_at  timestamptz,  -- mirrors introductions.last_emailed_at — one-time "new message" alert to admin, not per-message
  created_at       timestamptz not null default now()
);

create index idx_support_threads_user   on support_threads (user_id);
create index idx_support_threads_status on support_threads (status);
-- Applying to an existing database:
-- `create type support_thread_status as enum ('OPEN', 'CLOSED');
--  create table support_threads (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, status support_thread_status not null default 'OPEN', last_emailed_at timestamptz, created_at timestamptz not null default now());
--  create index idx_support_threads_user on support_threads (user_id);
--  create index idx_support_threads_status on support_threads (status);`

-- ─── MESSAGES ────────────────────────────────────────────────
-- Shared by both `introductions` (customer<->cleaner) and `support_threads`
-- (customer/cleaner<->admin) — exactly one of introduction_id/
-- support_thread_id is set per row, never both, never neither.

create table messages (
  id                 uuid primary key default gen_random_uuid(),
  introduction_id    uuid references introductions(id) on delete cascade,
  support_thread_id  uuid references support_threads(id) on delete cascade,
  sender_id          uuid not null references users(id) on delete cascade,
  body               text,
  photo_path         text,  -- Private storage path in 'chat-photos' bucket; signed URL generated at read time
  booking_id         uuid references bookings(id) on delete set null,  -- Set only on auto-generated booking-event messages
  system_event       text check (system_event in ('REQUESTED','CONFIRMED','DECLINED','CANCELLED','COMPLETED')),
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  constraint messages_content_present check (body is not null or photo_path is not null or system_event is not null),
  constraint messages_exactly_one_thread check (
    (introduction_id is not null and support_thread_id is null) or
    (introduction_id is null and support_thread_id is not null)
  )
);
-- Applying to an existing database:
-- `alter table messages alter column introduction_id drop not null,
--    add column support_thread_id uuid references support_threads(id) on delete cascade,
--    add constraint messages_exactly_one_thread check (
--      (introduction_id is not null and support_thread_id is null) or
--      (introduction_id is null and support_thread_id is not null)
--    );`

create index idx_messages_intro    on messages (introduction_id, created_at);
create index idx_messages_support  on messages (support_thread_id, created_at);
create index idx_messages_sender   on messages (sender_id);
create index idx_messages_unread   on messages (read_at) where read_at is null;
create index idx_messages_booking  on messages (booking_id);

-- ─── REVIEWS ─────────────────────────────────────────────────

create table reviews (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references bookings(id) on delete cascade,
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  rating              int not null check (rating >= 1 and rating <= 5),
  body                text,
  body_translations   jsonb,  -- Cached DeepL translations, keyed by locale — see /api/translate-review
  is_mock             boolean not null default false,
  created_at          timestamptz not null default now()
);

create index idx_reviews_cleaner  on reviews (cleaner_profile_id, created_at desc);
create index idx_reviews_customer on reviews (customer_id);

-- ─── DISPUTES ────────────────────────────────────────────────
-- Quality/property claims on a completed booking (not to be confused with a
-- cancellation reason) — the customer's claim, the cleaner's response, and
-- the booking's own completion photos (bookings.photo_paths) are reviewed
-- together by an admin.

create type dispute_status     as enum ('OPEN', 'RESOLVED');
create type dispute_resolution as enum ('CUSTOMER', 'CLEANER', 'UNRESOLVABLE');  -- Who the admin ruled in favor of; UNRESOLVABLE is a neutral split decision, framed as "the platform made a fair call with limited information" rather than either party winning/losing — applying to an existing database: `alter type dispute_resolution add value 'UNRESOLVABLE';`

create table disputes (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references bookings(id) on delete cascade,  -- one dispute per booking; applying to an existing database: `alter table disputes add constraint disputes_booking_id_key unique (booking_id);`
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  claim               text not null,
  cleaner_response    text,
  status              dispute_status not null default 'OPEN',
  resolution          dispute_resolution,
  refund_percentage   int not null default 0 check (refund_percentage >= 0 and refund_percentage <= 100),  -- 100 for CUSTOMER (manual refund button, or auto on SLA timeout — see auto_resolved), 0 for CLEANER, admin-chosen (default 50) for UNRESOLVABLE (auto-refunded on resolution)
  resolve_by          timestamptz,  -- created_at + 24h, stamped on insert — admin SLA, shown as a countdown/overdue flag in the queue
  auto_resolved       boolean not null default false,  -- true only when the auto-resolve-disputes cron/lazy-check closed this on SLA timeout (resolution forced to CUSTOMER/100%, no admin ever ruled) — distinguishes a real admin decision from a default-by-timeout one, so admin can spot a customer repeatedly waiting out the clock (see the per-customer dispute-history panel on /admin/users)
  admin_note          text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
-- Applying refund_percentage/resolve_by/auto_resolved to an existing database:
-- `alter table disputes add column refund_percentage int not null default 0 check (refund_percentage >= 0 and refund_percentage <= 100), add column resolve_by timestamptz, add column auto_resolved boolean not null default false;`

-- ─── CONTACT SUBMISSIONS ─────────────────────────────────────
-- General-inquiry contact form — separate from disputes (a specific claim
-- against a completed booking) and from in-app chat (an existing customer/
-- cleaner messaging a cleaner they've already found). This is for anyone,
-- logged in or not, with a question before that relationship exists —
-- no user_id, since the sender may not have an account at all.

create table contact_submissions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  message      text not null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index idx_contact_submissions_resolved on contact_submissions (resolved_at);

create index idx_disputes_status  on disputes (status);
create index idx_disputes_booking on disputes (booking_id);
create index idx_disputes_open_resolve_by on disputes (resolve_by) where status = 'OPEN';  -- backs the auto-resolve-disputes cron/lazy-check's overdue lookup

-- ─── TRIGGER: Update cleaner stats on review INSERT ──────────

create or replace function update_cleaner_stats()
returns trigger as $$
begin
  update cleaner_profiles
  set
    avg_rating            = (
      select round(avg(rating)::numeric, 2)
      from reviews
      where cleaner_profile_id = new.cleaner_profile_id
    ),
    review_count          = (
      select count(*)
      from reviews
      where cleaner_profile_id = new.cleaner_profile_id
    ),
    unique_customer_count = (
      select count(distinct customer_id)
      from bookings
      where cleaner_profile_id = new.cleaner_profile_id
        and status = 'COMPLETED'
    ),
    total_jobs_count      = (
      select count(*)
      from bookings
      where cleaner_profile_id = new.cleaner_profile_id
        and status = 'COMPLETED'
    )
  where id = new.cleaner_profile_id;
  return new;
end;
$$ language plpgsql;

create trigger on_review_insert
  after insert on reviews
  for each row execute function update_cleaner_stats();

-- ─── TRIGGER: Set review_prompted_at when booking COMPLETED ──

create or replace function on_booking_completed()
returns trigger as $$
begin
  if new.status = 'COMPLETED' and old.status != 'COMPLETED' then
    new.review_prompted_at = now();
    -- Also update total_jobs_count on cleaner profile
    update cleaner_profiles
    set total_jobs_count = total_jobs_count + 1,
        unique_customer_count = (
          select count(distinct customer_id)
          from bookings
          where cleaner_profile_id = new.cleaner_profile_id
            and status = 'COMPLETED'
        )
    where id = new.cleaner_profile_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger on_booking_status_change
  before update on bookings
  for each row execute function on_booking_completed();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

alter table users               enable row level security;
alter table cleaner_profiles    enable row level security;
-- cleaner_service_offerings' RLS enable + policies live inline in its own
-- block above, next to support_threads' — kept there rather than duplicated
-- here.
alter table introductions       enable row level security;
alter table favorites           enable row level security;
alter table bookings            enable row level security;
alter table addresses           enable row level security;
alter table messages            enable row level security;
alter table reviews             enable row level security;
alter table payments             enable row level security;
alter table disputes             enable row level security;
alter table verification_tokens  enable row level security;
alter table contact_submissions  enable row level security;
alter table support_threads      enable row level security;
-- No policies beyond enabling it on payments/disputes/verification_tokens/
-- contact_submissions — all four are only ever read/written via the
-- service-role admin client (API routes), never the anon-key browser
-- client, so RLS just needs to deny by default here.

-- Users: can only see and edit own record
create policy "users_select_own" on users for select using (auth.uid()::text = id::text);
create policy "users_update_own" on users for update using (auth.uid()::text = id::text);

-- Addresses: fully owner-only — no public read, no editing (delete + re-add
-- instead), just select/insert/delete scoped to the owning user
create policy "addresses_select_own" on addresses for select using (auth.uid()::text = user_id::text);
create policy "addresses_insert_own" on addresses for insert with check (auth.uid()::text = user_id::text);
create policy "addresses_delete_own" on addresses for delete using (auth.uid()::text = user_id::text);

-- Cleaner profiles: public read for ACTIVE profiles, plus the owner can
-- always read their own profile regardless of status (e.g. while PENDING)
create policy "cleaner_profiles_public_read" on cleaner_profiles
  for select using (status = 'ACTIVE');
create policy "cleaner_profiles_select_own" on cleaner_profiles
  for select using (auth.uid()::text = user_id::text);

-- Favorites: fully owner-only, same shape as addresses — no public read,
-- no editing (unfavorite + refavorite instead), just select/insert/delete
-- scoped to the owning customer
create policy "favorites_select_own" on favorites for select using (auth.uid()::text = customer_id::text);
create policy "favorites_insert_own" on favorites for insert with check (auth.uid()::text = customer_id::text);
create policy "favorites_delete_own" on favorites for delete using (auth.uid()::text = customer_id::text);

-- Introductions: visible to the two parties only
create policy "intros_own_parties" on introductions
  for select using (
    auth.uid()::text = customer_id::text or
    auth.uid()::text = (
      select user_id::text from cleaner_profiles where id = cleaner_profile_id
    )
  );

-- Support threads: the owning user, or any admin
create policy "support_threads_own_or_admin" on support_threads
  for select using (
    auth.uid()::text = user_id::text or
    exists (select 1 from users u where u.id::text = auth.uid()::text and u.role = 'ADMIN')
  );

-- Messages: visible to the two parties of an introduction thread, or (for a
-- support thread) its owning user and any admin
create policy "messages_own_thread" on messages
  for select using (
    (
      introduction_id is not null and exists (
        select 1 from introductions i
        where i.id = introduction_id
          and (
            auth.uid()::text = i.customer_id::text or
            auth.uid()::text = (
              select user_id::text from cleaner_profiles where id = i.cleaner_profile_id
            )
          )
      )
    ) or (
      support_thread_id is not null and (
        exists (select 1 from support_threads st where st.id = support_thread_id and st.user_id::text = auth.uid()::text)
        or exists (select 1 from users u where u.id::text = auth.uid()::text and u.role = 'ADMIN')
      )
    )
  );
-- Applying to an existing database:
-- `create policy "support_threads_own_or_admin" on support_threads for select using (auth.uid()::text = user_id::text or exists (select 1 from users u where u.id::text = auth.uid()::text and u.role = 'ADMIN'));
--  drop policy "messages_own_thread" on messages;
--  create policy "messages_own_thread" on messages for select using ((introduction_id is not null and exists (select 1 from introductions i where i.id = introduction_id and (auth.uid()::text = i.customer_id::text or auth.uid()::text = (select user_id::text from cleaner_profiles where id = i.cleaner_profile_id)))) or (support_thread_id is not null and (exists (select 1 from support_threads st where st.id = support_thread_id and st.user_id::text = auth.uid()::text) or exists (select 1 from users u where u.id::text = auth.uid()::text and u.role = 'ADMIN'))));`

-- Reviews: public read
create policy "reviews_public_read" on reviews for select using (true);

-- ─── REALTIME ────────────────────────────────────────────────
-- Enable Realtime for chat
-- In Supabase Dashboard → Database → Replication → enable messages table

-- ─── SEED: Example admin user ────────────────────────────────
-- Replace the hash with: bcrypt.hashSync('your-admin-password', 12)
-- insert into users (email, password_hash, role, full_name)
-- values ('admin@cypruscleaners.com.cy', '$2b$12$...', 'ADMIN', 'Admin');
