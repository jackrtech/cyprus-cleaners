import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Cyprus Cleaners — Find trusted cleaners across Cyprus',
    template: '%s | Cyprus Cleaners',
  },
  description:
    'Find vetted local cleaners for your home or apartment across Cyprus. Easy booking, real reviews, trusted by hundreds of customers.',
  keywords: ['cleaners Cyprus', 'house cleaning Cyprus', 'cleaning services Nicosia', 'apartment cleaning Limassol'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://cypruscleaners.com.cy'),
  openGraph: {
    type: 'website',
    siteName: 'Cyprus Cleaners',
    title: 'Cyprus Cleaners — Find trusted cleaners across Cyprus',
    description: 'Vetted local cleaners for homes and apartments. All 8 Cyprus cities.',
  },
}

export default async function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const messages = await getMessages()
  const session = await getServerSession(authOptions)

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-teal-900 antialiased">
        <SessionProvider session={session}>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
