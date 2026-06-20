'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPass] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await signIn('credentials', { email, password, redirect: false })

      if (result?.error) {
        setError(t('invalidCredentials'))
        return
      }

      // Fetch updated session to read role
      const res = await fetch('/api/auth/session')
      const session = await res.json()
      const role = session?.user?.role

      if (role === 'CLEANER') router.replace('/dashboard/cleaner')
      else if (role === 'ADMIN') router.replace('/admin')
      else router.replace('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="card p-8">
          <h1 className="text-[22px] font-medium text-[#0D1F1E] mb-1">{t('login')}</h1>
          <p className="text-[13px] text-[#6B8886] text-center mb-6">{t('forCustomersAndCleaners')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {error}
              </p>
            )}

            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="input w-full"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50"
            >
              {loading ? '…' : t('login')}
            </button>
          </form>
        </div>

        <div className="mt-5 space-y-2 text-center text-[13px] text-[#6B8886]">
          <p>
            {t('noAccount')}{' '}
            <Link href="/register" className="text-[#19706A] hover:underline font-medium">
              {t('registerHere')}
            </Link>
          </p>
          <p>
            {t('areYouACleaner')}{' '}
            <Link href="/register/cleaner" className="text-[#19706A] hover:underline font-medium">
              {t('registerHere')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
