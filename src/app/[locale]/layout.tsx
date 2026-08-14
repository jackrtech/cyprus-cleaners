import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { getMessages, getTranslations } from 'next-intl/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import Providers from '@/components/layout/Providers'
import Navbar from '@/components/Navbar'
import BottomTabBar from '@/components/layout/BottomTabBar'
import '@/styles/globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Cyprus Cleaners — Find trusted cleaners across Cyprus',
    template: '%s | Cyprus Cleaners',
  },
  description: 'Find vetted local cleaners for your home or apartment across Cyprus.',
  openGraph: {
    title: 'Cyprus Cleaners',
    description: 'Find vetted local cleaners for your home or apartment across Cyprus.',
    siteName: 'Cyprus Cleaners',
    type: 'website',
  },
  twitter: {
    card: 'summary',
  },
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const locale = params.locale ?? 'en'
  const messages = await getMessages()
  const session = await getServerSession(authOptions)
  const tCommon = await getTranslations({ locale, namespace: 'common' })

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${dmSans.variable} bg-surface text-teal-900 antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[400] focus:rounded-full focus:bg-[#19706A] focus:px-5 focus:py-2.5 focus:text-white focus:text-[14px] focus:font-medium"
        >
          {tCommon('skipToContent')}
        </a>
        <Providers session={session} messages={messages} locale={locale}>
          <Navbar />
          <main id="main-content">{children}</main>
          <BottomTabBar />
        </Providers>
      </body>
    </html>
  )
}
