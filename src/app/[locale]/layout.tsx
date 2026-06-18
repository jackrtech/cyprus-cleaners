import type { Metadata } from 'next'
import { getMessages } from 'next-intl/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import Providers from '@/components/layout/Providers'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Cyprus Cleaners — Find trusted cleaners across Cyprus',
    template: '%s | Cyprus Cleaners',
  },
  description: 'Find vetted local cleaners for your home or apartment across Cyprus.',
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
        <Providers session={session} messages={messages} locale={locale}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
