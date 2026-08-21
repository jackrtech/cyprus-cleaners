import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { getCleanerProfileForViewer, getCleanerReviewsBySlug, getCleanerBadgesBySlug } from '@/lib/cleaners'
import { BOOKING_FEE_EUR } from '@/lib/stripe'
import CleanerProfileView from '@/components/cleaners/CleanerProfileView'

// App-native counterpart to the public /cleaners/[slug] marketing page — same
// data fetches and view component, wrapped in the (app) shell instead of
// marketing chrome, so a logged-in visitor clicking a cleaner card from
// /dashboard/search never drops back into marketing Navbar/Footer. See the
// 2026-08-20 nav/routing investigation's "no app-native cleaner-profile page"
// finding.
export default async function AppCleanerProfilePage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions)

  const [cleaner, reviews, badges] = await Promise.all([
    getCleanerProfileForViewer(params.slug, session),
    getCleanerReviewsBySlug(params.slug),
    getCleanerBadgesBySlug(params.slug),
  ])

  if (!cleaner) notFound()

  return (
    <CleanerProfileView
      initialCleaner={{ ...cleaner, booking_fee_eur: BOOKING_FEE_EUR }}
      initialReviews={reviews}
      initialBadges={badges}
    />
  )
}
