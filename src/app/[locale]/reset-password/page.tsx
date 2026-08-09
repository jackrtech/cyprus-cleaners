'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link } from '@/navigation'
import Footer from '@/components/Footer'

type Status = 'checking' | 'invalid' | 'form' | 'success'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
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
  )
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<Status>('checking')

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [formError,       setFormError]       = useState<string | null>(null)
  const [submitting,      setSubmitting]      = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }

    fetch('/api/auth/validate-reset-token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setStatus(d.valid ? 'form' : 'invalid'))
      .catch(() => setStatus('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFormError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setStatus('success')
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center px-4">
      <div className="card max-w-[480px] w-full p-10 flex flex-col items-center text-center gap-5">

        {status === 'checking' && (
          <>
            <svg className="animate-spin" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="20" stroke="#E0EDEC" strokeWidth="4" />
              <path d="M44 24a20 20 0 0 0-20-20" stroke="#19706A" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <p className="text-[14px] text-[#6B8886]">Checking your link...</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="14" cy="14" r="11" />
                <path d="M10 10l8 8M18 10l-8 8" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-medium text-[#0D1F1E] mb-1">This link has expired</h1>
              <p className="text-[13px] text-[#6B8886]">Password reset links expire after 1 hour.</p>
            </div>
            <Link href="/forgot-password" className="btn-secondary">
              Request a new link
            </Link>
          </>
        )}

        {status === 'form' && (
          <div className="w-full text-left">
            <h1 className="text-[20px] font-medium text-[#0D1F1E] mb-5 text-center">Choose a new password</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                  {formError}
                </p>
              )}

              <div>
                <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                  New password
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
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="input w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B8886] hover:text-[#0D1F1E] transition-colors"
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50"
              >
                {submitting ? '…' : 'Reset password'}
              </button>
            </form>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 8L11.5 20 5 13.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-medium text-[#0D1F1E] mb-1">Password updated!</h1>
              <p className="text-[13px] text-[#6B8886]">Your password has been changed successfully.</p>
            </div>
            <Link href="/login" className="btn-primary">
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
    <Footer />
    </>
  )
}
