import { render, type RenderOptions } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import enMessages from '../../../messages/en.json'
import elMessages from '../../../messages/el.json'

const MESSAGES = { en: enMessages, el: elMessages } as const
type TestLocale = keyof typeof MESSAGES

// Renders a component inside a real NextIntlClientProvider using the app's
// actual message files, so `useTranslations` resolves real copy instead of
// needing a per-test mock of every key a component happens to use.
export function renderWithIntl(
  ui: ReactElement,
  { locale = 'en', ...options }: { locale?: TestLocale } & Omit<RenderOptions, 'wrapper'> = {}
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  })
}
