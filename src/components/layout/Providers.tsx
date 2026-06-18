'use client'

import { SessionProvider } from 'next-auth/react'
import { NextIntlClientProvider } from 'next-intl'
import type { Session } from 'next-auth'
import type { AbstractIntlMessages } from 'next-intl'

interface ProvidersProps {
  children: React.ReactNode
  session: Session | null
  messages: AbstractIntlMessages
  locale: string
}

export default function Providers({ children, session, messages, locale }: ProvidersProps) {
  return (
    <SessionProvider session={session}>
      <NextIntlClientProvider messages={messages} locale={locale}>
        {children}
      </NextIntlClientProvider>
    </SessionProvider>
  )
}
