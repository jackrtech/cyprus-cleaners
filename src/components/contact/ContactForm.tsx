'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Spinner from '@/components/ui/Spinner'

export default function ContactForm() {
  const t = useTranslations('contact')
  const locale = useLocale()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, locale }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('submitError'))
        return
      }
      setSent(true)
    } catch {
      setError(t('submitError'))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center py-4">
        <h1 className="text-[22px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-2">{t('successHeading')}</h1>
        <p className="text-[14px] text-[#5B7472] dark:text-[#9BB0AE]">{t('successBody')}</p>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-[22px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1.5">{t('heading')}</h1>
      <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] mb-6">{t('subtitle')}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="contact-name" className="block text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1.5">
            {t('name')}
          </label>
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            maxLength={100}
            autoFocus
            className="input w-full"
          />
        </div>

        <div>
          <label htmlFor="contact-email" className="block text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1.5">
            {t('email')}
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="input w-full"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="contact-message" className="block text-[13px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1.5">
            {t('message')}
          </label>
          <textarea
            id="contact-message"
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 2000))}
            required
            rows={5}
            placeholder={t('messagePlaceholder')}
            className="input w-full resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Spinner size={14} />}
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>
    </>
  )
}
