import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { getMessages, getTranslations } from 'next-intl/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import Providers from '@/components/layout/Providers'
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
      <head>
        {/* Sets the `dark` class before first paint so there's no flash of
            the wrong theme — mirrors the logic in useTheme.ts. Must run
            synchronously, before hydration, hence a plain inline script
            rather than an effect. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${dmSans.variable} bg-surface dark:bg-[#0F1817] text-teal-900 dark:text-[#ECF3F2] antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[400] focus:rounded-full focus:bg-[#19706A] focus:px-5 focus:py-2.5 focus:text-white focus:text-[14px] focus:font-medium"
        >
          {tCommon('skipToContent')}
        </a>
        {/* Each route group ((marketing), (auth), (app)) owns its own top
            chrome (nav/footer) and its own #main-content landmark. BottomTabBar
            is the one exception — it's rendered here, globally, rather than
            per route group (2026-08-19): it self-gates on session role, so it
            shows for a logged-in customer/cleaner on ANY route, not just
            inside the (app) shell — tapping it while browsing a marketing
            page (or landing on one via a shared link) no longer routes a
            logged-in user out of their own app chrome (see FLOWS.md). */}
        <Providers session={session} messages={messages} locale={locale}>
          {children}
          <BottomTabBar />
        </Providers>
      </body>
    </html>
  )
}
