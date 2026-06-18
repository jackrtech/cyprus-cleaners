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
create type introduction_status as enum ('PENDING', 'APPROVED', 'DECLINED');
create type booking_status as enum ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
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
  avatar_url        text,
  locale            locale_type not null default 'en',
  created_at        timestamptz not null default now()
);

create index idx_users_email on users (email);
create index idx_users_role  on users (role);

-- ─── CLEANER PROFILES ────────────────────────────────────────

create table cleaner_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references users(id) on delete cascade,
  slug                  text unique not null,
  display_name          text not null,
  bio                   text not null default '',
  bio_el                text,
  photo_url             text,
  city                  text not null,
  neighbourhoods        text[] not null default '{}',
  hourly_rate_eur       numeric(6,2) not null,
  services              service_type[] not null default '{}',
  languages             text[] not null default '{}',
  has_transport         boolean not null default false,
  is_company            boolean not null default false,
  -- Trust & verification
  verified              boolean not null default false,
  id_submitted_at       timestamptz,
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

create table introductions (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  message             text not null,
  status              introduction_status not null default 'PENDING',
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  -- One active introduction per customer-cleaner pair
  unique (customer_id, cleaner_profile_id)
);

create index idx_intros_customer on introductions (customer_id);
create index idx_intros_cleaner  on introductions (cleaner_profile_id);
create index idx_intros_status   on introductions (status);

-- ─── BOOKINGS ────────────────────────────────────────────────

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  introduction_id     uuid not null references introductions(id) on delete restrict,
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  service_type        service_type not null,
  date                date not null,
  start_time          time not null,
  duration_hours      numeric(4,2) not null,
  notes               text,
  status              booking_status not null default 'REQUESTED',
  review_prompted_at  timestamptz,  -- Set when status → COMPLETED; triggers review prompt
  created_at          timestamptz not null default now()
);

create index idx_bookings_customer on bookings (customer_id);
create index idx_bookings_cleaner  on bookings (cleaner_profile_id);
create index idx_bookings_status   on bookings (status);
create index idx_bookings_date     on bookings (date);

-- ─── MESSAGES ────────────────────────────────────────────────

create table messages (
  id                uuid primary key default gen_random_uuid(),
  introduction_id   uuid not null references introductions(id) on delete cascade,
  sender_id         uuid not null references users(id) on delete cascade,
  body              text not null,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_messages_intro  on messages (introduction_id, created_at);
create index idx_messages_sender on messages (sender_id);
create index idx_messages_unread on messages (read_at) where read_at is null;

-- ─── REVIEWS ─────────────────────────────────────────────────

create table reviews (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references bookings(id) on delete cascade,
  customer_id         uuid not null references users(id) on delete cascade,
  cleaner_profile_id  uuid not null references cleaner_profiles(id) on delete cascade,
  rating              int not null check (rating >= 1 and rating <= 5),
  body                text,
  created_at          timestamptz not null default now()
);

create index idx_reviews_cleaner  on reviews (cleaner_profile_id, created_at desc);
create index idx_reviews_customer on reviews (customer_id);

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
alter table messages            enable row level security;
alter table reviews             enable row level security;
alter table chat_notifications  enable row level security;

-- Users: can only see and edit own record
create policy "users_select_own" on users for select using (auth.uid()::text = id::text);
create policy "users_update_own" on users for update using (auth.uid()::text = id::text);

-- Cleaner profiles: public read for ACTIVE profiles
create policy "cleaner_profiles_public_read" on cleaner_profiles
  for select using (status = 'ACTIVE');

-- Introductions: visible to the two parties only
create policy "intros_own_parties" on introductions
  for select using (
    auth.uid()::text = customer_id::text or
    auth.uid()::text = (
      select user_id::text from cleaner_profiles where id = cleaner_profile_id
    )
  );

-- Messages: visible only within approved introductions to the two parties
create policy "messages_own_thread" on messages
  for select using (
    exists (
      select 1 from introductions i
      where i.id = introduction_id
        and i.status = 'APPROVED'
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
