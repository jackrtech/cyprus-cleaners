import type { Metadata } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { getActiveCleanersForViewer } from '@/lib/cleaners'
import { pageMetadata } from '@/lib/seo'
import CleanersDirectoryView from '@/components/cleaners/CleanersDirectoryView'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '/cleaners', titleKey: 'cleanersTitle', descriptionKey: 'cleanersDescription' })
}

export default async function CleanersPage() {
  const session = await getServerSession(authOptions)
  let initialCleaners: Awaited<ReturnType<typeof getActiveCleanersForViewer>> | null = null
  try {
    initialCleaners = await getActiveCleanersForViewer(session)
  } catch {
    initialCleaners = null
  }

  return <CleanersDirectoryView initialCleaners={initialCleaners} />
}
