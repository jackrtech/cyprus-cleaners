import type { Metadata } from 'next'
import Hero from '@/components/home/Hero'
import FeaturedCleaners from '@/components/home/FeaturedCleaners'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '', titleKey: 'homeTitle', descriptionKey: 'homeDescription' })
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedCleaners />
    </>
  )
}
