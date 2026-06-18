# Cyprus Cleaners — Setup Guide

## Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier is fine)
- A [Resend](https://resend.com) account (free tier is fine)

---

## 1. Install dependencies

```bash
cd cyprus-cleaners
npm install
```

---

## 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `cyprus-cleaners`, choose a region close to Cyprus (Frankfurt or London)
3. Once created, go to **SQL Editor** and paste the entire contents of `supabase/schema.sql` → Run
4. Go to **Database → Replication** → enable the `messages` table for Realtime
5. Go to **Settings → API** and copy your keys

---

## 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=         # From Supabase → Settings → API → URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # From Supabase → Settings → API → anon/public key
SUPABASE_SERVICE_ROLE_KEY=        # From Supabase → Settings → API → service_role key (secret!)

NEXTAUTH_SECRET=                  # Run: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

RESEND_API_KEY=                   # From resend.com → API Keys
RESEND_FROM_EMAIL=noreply@cypruscleaners.com.cy

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 4. Create your admin user

Run this in Supabase SQL Editor, replacing the hash with a bcrypt hash of your password:

```sql
-- Generate hash first (run in Node.js):
-- const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('yourpassword', 12));

insert into users (email, password_hash, role, full_name)
values (
  'admin@cypruscleaners.com.cy',
  '$2b$12$YOUR_HASH_HERE',
  'ADMIN',
  'Admin'
);
```

---

## 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the Cyprus Cleaners homepage.

---

## Project structure

```
src/
├── app/                     # Next.js App Router pages
│   ├── api/                 # API routes
│   │   └── auth/            # NextAuth + register endpoint
│   ├── auth/                # Sign-in and register pages
│   ├── cleaners/            # Directory + profile pages
│   ├── dashboard/           # Customer dashboard
│   ├── cleaner/dashboard/   # Cleaner dashboard
│   └── admin/               # Admin panel
├── components/
│   ├── ui/                  # Reusable UI: Button, Input, Badge, Card, Stars...
│   ├── layout/              # Navbar, Footer
│   ├── cleaners/            # CleanerCard, CleanerGrid, Filters
│   ├── chat/                # ChatWindow, MessageBubble, ChatList
│   ├── reviews/             # ReviewPrompt, ReviewCard, ProfileStats
│   └── bookings/            # BookingForm, BookingCard, Calendar
├── lib/
│   ├── supabase/            # Browser + server clients
│   ├── auth/                # NextAuth config
│   ├── email/               # Resend email helpers
│   └── utils/               # cn(), formatRate(), slugify()...
├── types/                   # All TypeScript types + enums
├── hooks/                   # useChat, useIntroductions, useSession...
└── styles/
    └── globals.css          # Design tokens + component classes
supabase/
└── schema.sql               # Full DB schema — run once in Supabase SQL Editor
messages/
├── en.json                  # English translations
└── el.json                  # Greek translations
```

---

## Sprint progress

- [x] **Sprint 1** — Foundation (this scaffold)
- [ ] **Sprint 2** — Public pages (homepage, directory, profiles, city guides)
- [ ] **Sprint 3** — Introduction flow, dashboards, email notifications
- [ ] **Sprint 4** — Chat (Realtime), bookings
- [ ] **Sprint 5** — Reviews, review prompt, admin panel
- [ ] **Sprint 6** — Polish, animations, mobile, SEO, launch
