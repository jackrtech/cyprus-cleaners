'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link } from '@/navigation'
import Footer from '@/components/Footer'
import type { UserRole } from '@/types'

type Status = 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<Status>('loading')
  const [role,   setRole]   = useState<UserRole | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    fetch('/api/auth/verify-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setRole(d.role ?? null)
        setStatus('success')
      })
      .catch(() => setStatus('error'))
  }, [token])

  const dashboardHref = role === 'CLEANER' ? '/dashboard/cleaner' : '/dashboard'

  return (
    <>
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center px-4">
      <div className="card max-w-[480px] w-full p-10 flex flex-col items-center text-center gap-5">

        {status === 'loading' && (
          <>
            <svg className="animate-spin" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="20" stroke="#E0EDEC" strokeWidth="4" />
              <path d="M44 24a20 20 0 0 0-20-20" stroke="#19706A" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <p className="text-[14px] text-[#6B8886]">Verifying your email address...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 8L11.5 20 5 13.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-medium text-[#0D1F1E] mb-1">Email verified!</h1>
              <p className="text-[13px] text-[#6B8886]">Your account is now fully active.</p>
            </div>
            <Link href={dashboardHref} className="btn-primary">
              Go to dashboard
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="14" cy="14" r="11" />
                <path d="M10 10l8 8M18 10l-8 8" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-medium text-[#0D1F1E] mb-1">This link has expired</h1>
              <p className="text-[13px] text-[#6B8886]">Request a new verification email from your dashboard.</p>
            </div>
            <Link href="/dashboard" className="btn-secondary">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
    <Footer />
    </>
  )
}
