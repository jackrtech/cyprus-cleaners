'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const MAX_CHARS = 500

interface Props {
  isOpen: boolean
  onClose: () => void
  cleanerProfileId: string
  firstName: string
  heading: string
}

export default function SendIntroModal({ isOpen, onClose, cleanerProfileId, firstName, heading }: Props) {
  const t = useTranslations('profile')

  const [message,  setMessage]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/introductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleaner_profile_id: cleanerProfileId, message }),
      })
      if (!res.ok) throw new Error()
      setSuccess(true)
    } catch {
      setError(t('introError'))
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setMessage('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(13,31,30,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="card w-full max-w-[480px] p-6">
        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#E8F4F3] flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M5 11l4 4 8-8" stroke="#19706A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-[#0D1F1E]">
              {t('introSuccess', { name: firstName })}
            </p>
            <button
              onClick={handleClose}
              className="btn-primary mt-5 rounded-full px-8 py-2.5 text-[14px]"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-medium text-[#0D1F1E]">{heading}</h2>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="text-[#6B8886] hover:text-[#0D1F1E] transition-colors text-[22px] leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                  {error}
                </p>
              )}

              <div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MAX_CHARS))}
                  required
                  rows={5}
                  className="input w-full resize-none"
                  placeholder={t('introPlaceholder', { name: firstName })}
                />
                <p className="text-[11px] text-[#6B8886] text-right mt-1">
                  {message.length}/{MAX_CHARS} {t('characters')}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || message.trim().length === 0}
                className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50"
              >
                {loading ? '…' : t('sendIntro')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
