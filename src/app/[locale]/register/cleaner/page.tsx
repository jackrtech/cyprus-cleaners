'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'

const CITIES: { key: string; value: string }[] = [
  { key: 'nicosia',   value: 'Nicosia' },
  { key: 'limassol',  value: 'Limassol' },
  { key: 'larnaca',   value: 'Larnaca' },
  { key: 'paphos',    value: 'Paphos' },
  { key: 'famagusta', value: 'Famagusta' },
  { key: 'paralimni', value: 'Paralimni' },
  { key: 'ayiaNapa',  value: 'Ayia Napa' },
  { key: 'protaras',  value: 'Protaras' },
]

export default function RegisterCleanerPage() {
  const t       = useTranslations('auth')
  const tCities = useTranslations('cities')
  const router  = useRouter()

  const [displayName,      setDisplayName]      = useState('')
  const [selectedCities,   setSelectedCities]   = useState<string[]>([])
  const [cleanerType,      setCleanerType]      = useState<'individual' | 'company'>('individual')
  const [hourlyRate,       setHourlyRate]        = useState('10')
  const [email,            setEmail]             = useState('')
  const [password,         setPassword]          = useState('')
  const [confirmPassword,  setConfirm]           = useState('')
  const [showPassword,     setShowPass]          = useState(false)
  const [showConfirm,      setShowConfirm]       = useState(false)
  const [error,            setError]             = useState<string | null>(null)
  const [loading,          setLoading]           = useState(false)

  function toggleCity(value: string) {
    setSelectedCities(prev =>
      prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (selectedCities.length === 0) {
      setError(t('atLeastOneCity'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:       displayName,
          email,
          password,
          role:            'CLEANER',
          cities:          selectedCities,
          hourly_rate_eur: Number(hourlyRate),
          cleaner_type:    cleanerType,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        return
      }

      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError(t('invalidCredentials'))
        return
      }

      router.replace('/dashboard/cleaner')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] py-10 px-4">
      <div className="w-full max-w-[480px] mx-auto">
        <div className="card p-8">
          <h1 className="text-[22px] font-medium text-[#0D1F1E] mb-6">{t('registerAsCleaner')}</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                {error}
              </p>
            )}

            {/* Display name */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('displayName')}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                autoFocus
                className="input w-full"
                placeholder="Maria Georgiou"
              />
            </div>

            {/* Cities */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('serveCities')}
              </label>
              <div className="flex flex-wrap gap-2">
                {CITIES.map(city => {
                  const selected = selectedCities.includes(city.value)
                  return (
                    <button
                      key={city.key}
                      type="button"
                      onClick={() => toggleCity(city.value)}
                      className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors ${
                        selected
                          ? 'bg-[#19706A] border-[#19706A] text-white'
                          : 'bg-white border-[#E0EDEC] text-[#0D1F1E] hover:border-[#19706A]'
                      }`}
                    >
                      {tCities(city.key as Parameters<typeof tCities>[0])}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Account type */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('cleanerType')}
              </label>
              <div className="flex rounded-[10px] border border-[#E0EDEC] overflow-hidden">
                {(['individual', 'company'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCleanerType(type)}
                    className={`flex-1 py-2 text-[13px] transition-colors ${
                      cleanerType === type
                        ? 'bg-[#19706A] text-white'
                        : 'bg-white text-[#6B8886] hover:text-[#0D1F1E]'
                    }`}
                  >
                    {t(type)}
                  </button>
                ))}
              </div>
            </div>

            {/* Hourly rate */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('hourlyRate')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B8886] text-[14px] pointer-events-none">
                  €
                </span>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(e.target.value)}
                  required
                  min={5}
                  max={200}
                  step={1}
                  className="input w-full pl-7"
                  placeholder="10"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="input w-full"
                placeholder={t('emailPlaceholder')}
              />
            </div>

            {/* Password */}
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
                  minLength={8}
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

            {/* Confirm password */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? t('hidePassword') : t('showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
                >
                  {showConfirm ? (
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
              {loading ? '…' : t('registerAsCleaner')}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-[13px] text-[#6B8886]">
          <p>
            {t('alreadyHaveAccount')}{' '}
            <Link href="/login" className="text-[#19706A] hover:underline font-medium">
              {t('login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
