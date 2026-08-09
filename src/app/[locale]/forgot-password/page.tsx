'use client'

import { useState } from 'react'
import { Link } from '@/navigation'
import Footer from '@/components/Footer'

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
    } catch {
      // Always show the same message regardless of outcome
    } finally {
      setLoading(false)
      setSubmitted(true)
    }
  }

  return (
    <>
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center px-4">
      <div className="w-full max-w-[480px]">
        <div className="card p-8">
          <h1 className="text-[22px] font-medium text-[#0D1F1E] mb-1">Reset your password</h1>
          <p className="text-[13px] text-[#6B8886] mb-6">Enter your email and we&apos;ll send you a reset link</p>

          {submitted ? (
            <p className="text-[13px] text-[#0D1F1E] bg-[#E8F4F3] border border-[#E0EDEC] rounded-[10px] px-4 py-3">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                  Email address
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

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50"
              >
                {loading ? '…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>

        <div className="mt-5 text-center text-[13px] text-[#6B8886]">
          <Link href="/login" className="text-[#19706A] hover:underline font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
    <Footer />
    </>
  )
}
