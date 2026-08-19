import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { getCleanerProfileForViewer, getCleanerReviewsBySlug } from '@/lib/cleaners'
import { BOOKING_FEE_EUR } from '@/lib/stripe'
import CleanerProfileView from '@/components/cleaners/CleanerProfileView'

export default async function CleanerProfilePage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions)

  // Independent fetches, run in parallel — mirrors the two separate
  // client-side requests this page used to make on mount, just moved
  // server-side so the first HTML sent already has real content instead of
  // an empty shell that fills in after hydration.
  const [cleaner, reviews] = await Promise.all([
    getCleanerProfileForViewer(params.slug, session),
    getCleanerReviewsBySlug(params.slug),
  ])

  if (!cleaner) notFound()

  return (
    <CleanerProfileView
      initialCleaner={{ ...cleaner, booking_fee_eur: BOOKING_FEE_EUR }}
      initialReviews={reviews}
    />
  )
}
