'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import FullScreenModal from '@/components/ui/FullScreenModal'
import SupportChatPanel from './SupportChatPanel'

interface Props {
  currentUserId: string
}

// Find-or-create the caller's own support thread on first open, then hand
// off to SupportChatPanel — mirrors how ensureThreadAndOpenChat works for a
// customer/cleaner introduction, just against /api/support/threads instead.
export default function SupportChatButton({ currentUserId }: Props) {
  const t = useTranslations('dashboard')

  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    setOpen(true)
    if (threadId) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/support/threads', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data: { id: string } = await res.json()
      setThreadId(data.id)
    } catch {
      setError(t('contactSupportError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="block w-full text-[13px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors"
      >
        {t('contactSupport')}
      </button>

      <FullScreenModal isOpen={open} onClose={() => setOpen(false)}>
        {threadId ? (
          <SupportChatPanel
            threadId={threadId}
            currentUserId={currentUserId}
            otherPartyName={t('supportPartyName')}
            onClose={() => setOpen(false)}
          />
        ) : (
          <div className="flex items-center justify-center min-h-[200px] p-6">
            {error ? (
              <p className="text-[13px] text-red-600">{error}</p>
            ) : loading ? (
              <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">…</p>
            ) : null}
          </div>
        )}
      </FullScreenModal>
    </>
  )
}
