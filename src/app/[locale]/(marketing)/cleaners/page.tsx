import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo'
import CleanersDirectoryView from '@/components/cleaners/CleanersDirectoryView'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '/cleaners', titleKey: 'cleanersTitle', descriptionKey: 'cleanersDescription' })
}

export default function CleanersPage() {
  return <CleanersDirectoryView />
}
