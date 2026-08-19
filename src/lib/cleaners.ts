import type { Session } from 'next-auth'
import { createAdminClient } from '@/lib/supabase/server'
import type { WeeklyAvailability } from '@/lib/availability'

// Server-side data fetchers shared between the public cleaner pages (now
// server-rendered, added 2026-08-19 to kill the client-fetch-after-hydration
// waterfall that was the leading suspect for the "site feels slow" report —
// see FLOWS.md) and their matching API routes (still needed for any
// client-side refetch, e.g. after toggling a favorite). Keeping one copy of
// each query here means the SSR path and the API route can never drift.

export const CLEANER_LIST_SELECT = `
  id, slug, display_name, bio, photo_url, cover_photo_url, city, cities,
  hourly_rate_eur, services, languages, cleaner_type,
  gender, verified, avg_rating, review_count,
  unique_customer_count, total_jobs_count, availability,
  is_mock, is_company, created_at
`

export const CLEANER_DETAIL_SELECT = `
  id, slug, display_name, bio, photo_url, cover_photo_url, city, cities,
  hourly_rate_eur, services, languages, cleaner_type,
  gender, verified, avg_rating, review_count,
  unique_customer_count, total_jobs_count, availability,
  is_mock, is_company, user_id, has_transport, created_at,
  cleaner_service_offerings ( code, price_eur )
`

export interface CleanerListRow {
  id:                    string
  slug:                  string
  display_name:          string
  bio:                   string | null
  photo_url:             string | null
  cover_photo_url:       string | null
  city:                  string | null
  cities:                string[] | null
  hourly_rate_eur:       number
  services:              ('HOUSE' | 'APARTMENT')[] | null
  languages:             string[] | null
  cleaner_type:          'individual' | 'company' | null
  gender:                'female' | 'male' | null
  verified:              boolean
  avg_rating:            number
  review_count:          number
  unique_customer_count: number
  total_jobs_count:      number
  availability:          WeeklyAvailability | null
  is_mock:               boolean
  is_company:            boolean
  created_at:            string
  is_favorited:          boolean
}

export interface CleanerDetailRow extends Omit<CleanerListRow, 'is_favorited'> {
  has_transport:  boolean
  is_own_profile: boolean
  is_favorited:   boolean
  cleaner_service_offerings: { code: string; price_eur: number }[] | null
}

export interface CleanerReviewRow {
  id:                 string
  rating:             number
  body:               string
  body_translations:  Record<string, string> | null
  created_at:         string
  customer_id:        string | null
  is_mock:            boolean
  users:              { full_name: string } | null
}

async function favoritedIdsFor(
  supabase: ReturnType<typeof createAdminClient>,
  session: Session | null
): Promise<Set<string>> {
  if (session?.user?.role !== 'CUSTOMER') return new Set()
  const { data } = await supabase
    .from('favorites')
    .select('cleaner_profile_id')
    .eq('customer_id', session.user.id)
  return new Set(((data ?? []) as { cleaner_profile_id: string }[]).map(f => f.cleaner_profile_id))
}

// Every ACTIVE cleaner, with is_favorited resolved for the current viewer —
// same shape GET /api/cleaners returns. Used by the homepage and directory.
export async function getActiveCleanersForViewer(session: Session | null): Promise<CleanerListRow[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select(CLEANER_LIST_SELECT)
    .eq('status', 'ACTIVE')
    .order('avg_rating', { ascending: false })
    .order('review_count', { ascending: false })

  if (error) {
    console.error('getActiveCleanersForViewer error:', error)
    throw error
  }

  const rows = (data ?? []) as unknown as Omit<CleanerListRow, 'is_favorited'>[]
  if (!rows.length) return rows.map(row => ({ ...row, is_favorited: false }))

  const favoritedIds = await favoritedIdsFor(supabase, session)
  return rows.map(row => ({ ...row, is_favorited: favoritedIds.has(row.id) }))
}

// One cleaner by slug, with is_own_profile/is_favorited resolved for the
// current viewer — same shape GET /api/cleaners/[slug] returns (minus
// booking_fee_eur, which is a static constant the caller adds). Returns null
// on not-found rather than throwing, matching the route's 404 behaviour.
export async function getCleanerProfileForViewer(slug: string, session: Session | null): Promise<CleanerDetailRow | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select(CLEANER_DETAIL_SELECT)
    .eq('slug', slug)
    .eq('status', 'ACTIVE')
    .single()

  if (error || !data) return null

  const row = data as unknown as Omit<CleanerDetailRow, 'is_favorited' | 'is_own_profile'> & { user_id: string }
  const { user_id, ...publicData } = row
  const is_own_profile = session?.user?.id === user_id

  let is_favorited = false
  if (session?.user?.role === 'CUSTOMER') {
    const { data: favorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('customer_id', session.user.id)
      .eq('cleaner_profile_id', row.id)
      .maybeSingle()
    is_favorited = !!favorite
  }

  return { ...publicData, is_own_profile, is_favorited }
}

// Reviews for one cleaner, looked up by slug (not id) so this can run in
// parallel with getCleanerProfileForViewer instead of waiting on it — same
// two-independent-fetches shape the client-side version used.
export async function getCleanerReviewsBySlug(slug: string): Promise<CleanerReviewRow[]> {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!profile) return []

  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, body_translations, created_at, customer_id, is_mock, users(full_name)')
    .eq('cleaner_profile_id', profile.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getCleanerReviewsBySlug error:', error)
    throw error
  }

  return (data ?? []) as unknown as CleanerReviewRow[]
}
