# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start-dev   # git pull + npm install + env check + npm run dev — use this to start a session
npm run dev          # start dev server only (localhost:3000)
npm run build        # production build
npm run lint         # next lint
npx tsc --noEmit     # typecheck — this is what the pre-push hook runs; fix errors before pushing
npm run db:push       # push local schema changes via supabase CLI
npm run db:reset       # reset local Supabase DB via supabase CLI
```

There is no test suite/framework configured in this repo (no jest/vitest, no `test` script).

Git hooks live in `.githooks/` and are activated via `npm run prepare` (sets `core.hooksPath`). The `pre-push` hook runs `tsc --noEmit` and blocks the push on type errors — do not bypass with `--no-verify`.

Database schema is defined in `supabase/schema.sql` — it is applied by pasting into the Supabase SQL Editor (see README), not via migrations. When changing the schema, edit that file directly and note that it also contains the RLS policies and stats triggers (see Architecture below).

## Architecture

**Stack**: Next.js 14 (App Router), TypeScript strict, Supabase (Postgres + Auth via RLS + Realtime), NextAuth (credentials provider, JWT sessions), next-intl (en/el), Tailwind, Resend (email), DeepL (review translation).

### i18n routing
Every user-facing route lives under `src/app/[locale]/...`. Locale is `en` (default, no prefix) or `el` (prefixed `/el/...`), configured with `localePrefix: 'as-needed'` in `src/middleware.ts`. `src/app/layout.tsx` is a bare passthrough root layout; the real `<html>`/providers layout is `src/app/[locale]/layout.tsx`. Translation strings live in `messages/en.json` and `messages/el.json`, loaded per-request via `src/lib/i18n.ts`. API routes under `src/app/api/` are NOT locale-prefixed.

### Auth & route protection
NextAuth uses a single Credentials provider (`src/lib/auth/config.ts`) that checks `users.password_hash` (bcrypt) via the Supabase admin client — there is no Supabase Auth session, NextAuth JWT is the only session mechanism. Roles are `CUSTOMER | CLEANER | ADMIN`, carried on the JWT/session (`token.role`).

`src/middleware.ts` combines the NextAuth middleware with the next-intl middleware: `/admin/**` requires `ADMIN`, `/dashboard/cleaner/**` requires `CLEANER` (checked before the more general dashboard rule), `/dashboard/**` requires any authenticated user, everything else is public and just passes through the i18n middleware. When adding a new protected area, add the role check here rather than in page-level `getServerSession` guards.

### Supabase clients — three different ones, don't mix them up
- `src/lib/supabase/client.ts` — browser client (anon key), for client components.
- `src/lib/supabase/server.ts` `createClient()` — server client (anon key, cookie-bound), respects RLS, for server components/route handlers acting as the current user.
- `src/lib/supabase/server.ts` `createAdminClient()` — service-role key, **bypasses RLS**. Used by NextAuth's `authorize()` and anywhere server code needs to act outside a user's own RLS scope. Never expose this client or the service-role key to the browser.

RLS policies in `supabase/schema.sql` are the actual authorization boundary for direct table reads (e.g. a cleaner profile is only publicly selectable when `status = 'ACTIVE'`; messages are only visible to the two parties of their thread). When adding a new table, add matching RLS policies in the same migration block.

### Domain model / flow
`users` → `cleaner_profiles` (1:1, cleaner-role users have a profile) → `introductions` (a lightweight messaging thread between a customer and a cleaner — one per pair, no approval gate) → `messages` (belong to a thread) and `bookings` (REQUESTED → CONFIRMED → COMPLETED → CANCELLED, requires a thread id) → `reviews` (one per completed booking). `cleaner_profiles` carries denormalised stats (`avg_rating`, `review_count`, `unique_customer_count`, `total_jobs_count`) that are maintained by two Postgres triggers in `schema.sql` (`update_cleaner_stats` on review insert, `on_booking_completed` on booking status change to COMPLETED) — never update those stat columns from application code, they're trigger-owned. Chat is Supabase Realtime on the `messages` table (must be enabled in Supabase Dashboard → Replication, it's not automatic from the schema alone).

Shared TypeScript types/enums for all of the above live in `src/types/index.ts` and mirror the SQL enums exactly (`UserRole`, `CleanerStatus`, `ServiceType`, `BookingStatus`, `Locale`) — keep them in sync when changing `schema.sql`.

### Directory layout
```
src/app/[locale]/     Public + authenticated pages (App Router)
src/app/api/          API routes, not locale-prefixed
src/components/       ui/, layout/, cleaners/, chat/, home/, introductions/
src/lib/supabase/     client.ts, server.ts (see above)
src/lib/auth/         NextAuth config
src/lib/utils/        cn(), formatRate(), slugify(), etc.
src/types/            All shared TS types + enums (mirrors schema.sql)
src/hooks/            useChat, useIntroductions, useSession, etc.
supabase/schema.sql   Full DB schema, RLS policies, triggers — single source of truth, applied manually
messages/{en,el}.json Translation strings
```

## Design & product context

Full detail in `DESIGN.md` (palette, type scale, spacing, layout/anti-pattern rules) and `PRODUCT.md` (users, brand voice, design principles, anti-references, accessibility targets). Key points that affect implementation choices:

- Two user groups with very different needs: customers (primary, mobile-first UX) and independent cleaners (secondary, lighter/simpler surfaces, may have limited English — keep cleaner-facing copy simple and translated).
- Brand explicitly avoids "generic SaaS" patterns: no gradient hero sections, no hero-metric stat rows, no icon-grid feature sections, no countdown/scarcity dark patterns.
- WCAG 2.1 AA target on all primary flows; both `en` and `el` must be fully accessible (no English-only alt text/ARIA labels); all animation needs a `prefers-reduced-motion` fallback.
- Design tokens (colors, radii, spacing) are defined in `DESIGN.md` and implemented as CSS variables/component classes in `src/styles/globals.css` (`.btn-primary`, `.card`, `.input`, `.badge-teal`, etc.) — reuse these classes rather than inventing new ad hoc styles.

## Contributor workflow (from CONTRIBUTING.md)

- Start every session with `npm run start-dev` (pulls latest, installs, checks env, starts dev server).
- First-time setup: copy `.env.example` → `.env.local` (get real values from Jack), then `npm run prepare` to activate git hooks.
- Always pull before starting work and push before finishing (`git add . && git commit -m "..." && git push origin main`) — this repo works directly on `main`, not feature branches.
- Never commit `.env.local`.
- Fix TypeScript errors before pushing (the pre-push hook enforces this).

# Project process rules — Cyprus Cleaners

These rules apply to every task, in addition to whatever the task description says.

## Definition of done

A task is not complete until ALL of the following are true, not just "the code works":

1. **Code is committed** with a clear message describing what changed.
2. **`FLOWS.md` (repo root — the only copy; do not create one under `docs/` or anywhere else) is updated in the same commit** if the task did any of:
   - added, removed, or changed a user-facing screen or step
   - changed a state machine (booking status, payment status, dispute status, verification status)
   - added or changed an email/notification trigger
   - changed a "known gap" that FLOWS.md currently lists — remove it from the gaps section if it's now fixed
   - If none of these apply, say so explicitly in the commit message or task comment ("no FLOWS.md change needed — internal/non-flow change") rather than silently skipping it.
3. **The Todoist task is marked complete**, with a comment noting:
   - the commit hash(es) that shipped it
   - anything that was descoped, deferred, or done differently than the original task description
   - any new bug or gap this surfaced (file it as a new task, don't just mention it and move on)
4. **If the task fixes a bug that was previously marked "done" and broke** (like the dispute-button visibility issue), say so explicitly in the Todoist comment — don't just close it silently. This is a pattern worth tracking, not hiding.

## Before starting a build session

- Pull the FULL Todoist task list — **open AND completed** — not just open tasks. A plain open-task query misses real context (this has caused confusion before: 92 completed tasks were invisible to a default search).
- Check FLOWS.md's last-modified date against the most recent relevant commits. If FLOWS.md is older than code that should have updated it, flag this before proceeding — don't build on top of a doc you already know is stale.

## Weekly sync check (do this every Monday, tied to the recurring "Weekly review" task)

Compare three things against each other and flag any mismatch:
- FLOWS.md
- `git log` from the past 7 days
- Todoist completed tasks from the past 7 days

If something shipped in git but isn't in FLOWS.md or isn't closed in Todoist, fix that before doing anything else that week.

## Never assume "done" without verification

Don't mark a task done because you wrote the code. Verify it against the actual running app/DB where possible (this project has been burned by "done" tasks that didn't work — ID upload failure, dispute button invisible, admin panel empty-state bug — all marked complete before actually working).
