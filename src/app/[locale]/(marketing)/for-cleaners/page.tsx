import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo'
import ForCleanersView from './ForCleanersView'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '/for-cleaners', titleKey: 'forCleanersTitle', descriptionKey: 'forCleanersDescription' })
}

export default function ForCleanersPage() {
  return <ForCleanersView />
}
