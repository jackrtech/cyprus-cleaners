import type { Metadata } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { getActiveCleanersForViewer } from '@/lib/cleaners'
import Hero from '@/components/home/Hero'
import FeaturedCleaners from '@/components/home/FeaturedCleaners'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '', titleKey: 'homeTitle', descriptionKey: 'homeDescription' })
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const initialCleaners = await getActiveCleanersForViewer(session).catch(() => [])

  return (
    <>
      <Hero />
      <FeaturedCleaners initialCleaners={initialCleaners} />
    </>
  )
}
