import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Builds page-level metadata (title, description, hreflang alternates,
// Open Graph, Twitter card) for a public page — locale-aware via the `seo`
// message namespace. `path` is the unprefixed route, e.g. '' for home,
// '/cleaners' for the directory — the `en` variant gets no prefix
// (localePrefix: 'as-needed'), `el` always gets `/el`.
export async function pageMetadata({
  locale, path, titleKey, descriptionKey,
}: {
  locale: string
  path: string
  titleKey: string
  descriptionKey: string
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'seo' })
  const title = t(titleKey)
  const description = t(descriptionKey)
  const enUrl = `${BASE_URL}${path || '/'}`
  const elUrl = `${BASE_URL}/el${path}`
  const canonical = locale === 'el' ? elUrl : enUrl

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { en: enUrl, el: elUrl },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Cyprus Cleaners',
      locale: locale === 'el' ? 'el_CY' : 'en_CY',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}
