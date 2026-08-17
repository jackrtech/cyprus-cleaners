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
create type cleaning_type as enum ('STANDARD', 'DEEP');
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
  -- Denormalised stats (updated by triggers)
  avg_rating            numeric(3,2) not null default 0,
  review_count          int not null default 0,
  unique_customer_count int not null default 0,
  total_jobs_count      int not null default 0,
  -- Availability: {"mon": [9, 17], "tue": [9, 17], ...}
  availability          jsonb,
  created_at            timestamptz not null default now()
);

create index idx_cleaner_city     on cleaner_profiles (city);
create index idx_cleaner_status   on cleaner_profiles (status);
create index idx_cleaner_verified on cleaner_profiles (verified);
create index idx_cleaner_rating   on cleaner_profiles (avg_rating desc);
create index idx_cleaner_services on cleaner_profiles using gin (services);

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
  status              booking_status not null default 'REQUESTED',
  review_prompted_at  timestamptz,  -- Set when status → COMPLETED; triggers review prompt
  completed_at        timestamptz,  -- Set when status → COMPLETED; anchors the 7-day customer dispute-filing window. Applying to an existing database: `alter table bookings add column completed_at timestamptz;`
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

create type payment_status as enum ('PENDING', 'PAID', 'REFUNDED', 'FAILED', 'REFUND_FAILED');
-- REFUND_FAILED: the Stripe refund call itself errored after a CANCEL — the
-- booking is CANCELLED but the customer was never actually refunded. Needs a
-- manual retry from the admin cancellations ledger. Applying to an existing
-- database (this file is bootstrap-only, not re-run): `alter type payment_status add value 'REFUND_FAILED';`
create type verification_status as enum ('PENDING', 'APPROVED', 'REJECTED');
-- Applying to an existing database: `create type verification_status as enum ('PENDING', 'APPROVED', 'REJECTED');`
-- then `alter table cleaner_profiles add column verification_status verification_status;`

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
  created_at                  timestamptz not null default now()
);

create index idx_payments_status on payments (status);

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

-- ─── MESSAGES ────────────────────────────────────────────────

create table messages (
  id                uuid primary key default gen_random_uuid(),
  introduction_id   uuid not null references introductions(id) on delete cascade,
  sender_id         uuid not null references users(id) on delete cascade,
  body              text,
  photo_path        text,  -- Private storage path in 'chat-photos' bucket; signed URL generated at read time
  booking_id        uuid references bookings(id) on delete set null,  -- Set only on auto-generated booking-event messages
  system_event      text check (system_event in ('REQUESTED','CONFIRMED','DECLINED','CANCELLED','COMPLETED')),
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  constraint messages_content_present check (body is not null or photo_path is not null or system_event is not null)
);

create index idx_messages_intro   on messages (introduction_id, created_at);
create index idx_messages_sender  on messages (sender_id);
create index idx_messages_unread  on messages (read_at) where read_at is null;
create index idx_messages_booking on messages (booking_id);

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
  refund_percentage   int not null default 0 check (refund_percentage >= 0 and refund_percentage <= 100),  -- 100 for CUSTOMER (manual refund button), 0 for CLEANER, admin-chosen (default 50) for UNRESOLVABLE (auto-refunded on resolution)
  resolve_by          timestamptz,  -- created_at + 5 days, stamped on insert — admin SLA, shown as a countdown/overdue flag in the queue
  admin_note          text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
-- Applying refund_percentage/resolve_by to an existing database:
-- `alter table disputes add column refund_percentage int not null default 0 check (refund_percentage >= 0 and refund_percentage <= 100), add column resolve_by timestamptz;`

create index idx_disputes_status  on disputes (status);
create index idx_disputes_booking on disputes (booking_id);

-- ─── CHAT NOTIFICATIONS ──────────────────────────────────────

create table chat_notifications (
  id                uuid primary key default gen_random_uuid(),
  introduction_id   uuid not null references introductions(id) on delete cascade,
  recipient_id      uuid not null references users(id) on delete cascade,
  last_notified_at  timestamptz,
  pending_count     int not null default 0,
  unique (introduction_id, recipient_id)
);

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
alter table introductions       enable row level security;
alter table bookings            enable row level security;
alter table addresses           enable row level security;
alter table messages            enable row level security;
alter table reviews             enable row level security;
alter table chat_notifications  enable row level security;
alter table payments            enable row level security;
alter table disputes            enable row level security;
alter table verification_tokens enable row level security;
-- No policies beyond enabling it on payments/disputes/verification_tokens —
-- all three are only ever read/written via the service-role admin client
-- (API routes), never the anon-key browser client, so RLS just needs to
-- deny by default here.

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

-- Introductions: visible to the two parties only
create policy "intros_own_parties" on introductions
  for select using (
    auth.uid()::text = customer_id::text or
    auth.uid()::text = (
      select user_id::text from cleaner_profiles where id = cleaner_profile_id
    )
  );

-- Messages: visible to the two parties of the thread
create policy "messages_own_thread" on messages
  for select using (
    exists (
      select 1 from introductions i
      where i.id = introduction_id
        and (
          auth.uid()::text = i.customer_id::text or
          auth.uid()::text = (
            select user_id::text from cleaner_profiles where id = i.cleaner_profile_id
          )
        )
    )
  );

-- Reviews: public read
create policy "reviews_public_read" on reviews for select using (true);

-- ─── REALTIME ────────────────────────────────────────────────
-- Enable Realtime for chat
-- In Supabase Dashboard → Database → Replication → enable messages table

-- ─── SEED: Example admin user ────────────────────────────────
-- Replace the hash with: bcrypt.hashSync('your-admin-password', 12)
-- insert into users (email, password_hash, role, full_name)
-- values ('admin@cypruscleaners.com.cy', '$2b$12$...', 'ADMIN', 'Admin');
