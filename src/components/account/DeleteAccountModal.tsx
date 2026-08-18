'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import FullScreenModal from '@/components/ui/FullScreenModal'

interface Props {
  isOpen:  boolean
  onClose: () => void
}

const CONFIRM_PHRASE = 'DELETE'

const BLOCKED_MESSAGE_KEY: Record<string, 'deleteAccountBlockedActiveBooking' | 'deleteAccountBlockedOpenDispute' | 'deleteAccountBlockedRefundFailed'> = {
  ACTIVE_BOOKING: 'deleteAccountBlockedActiveBooking',
  OPEN_DISPUTE:   'deleteAccountBlockedOpenDispute',
  REFUND_FAILED:  'deleteAccountBlockedRefundFailed',
}

export default function DeleteAccountModal({ isOpen, onClose }: Props) {
  const t = useTranslations('dashboard')

  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE

  function handleClose() {
    if (deleting) return
    setConfirmText('')
    setError(null)
    onClose()
  }

  async function handleDelete() {
    if (!canConfirm || deleting) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/user/me', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const key = body?.error ? BLOCKED_MESSAGE_KEY[body.error] : undefined
        setError(key ? t(key) : t('deleteAccountError'))
        setDeleting(false)
        return
      }
      await signOut({ callbackUrl: '/' })
    } catch {
      setError(t('deleteAccountError'))
      setDeleting(false)
    }
  }

  return (
    <FullScreenModal isOpen={isOpen} onClose={handleClose}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0EDEC] dark:border-[#253634] shrink-0">
        <span className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{t('deleteAccountModalTitle')}</span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0 ml-2"
        >
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <p className="text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] leading-relaxed">{t('deleteAccountModalBody')}</p>

        {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] px-3 py-2">{error}</p>}

        <div>
          <label htmlFor="delete-account-confirm" className="block text-[12px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] mb-1.5">
            {t('deleteAccountConfirmLabel')}
          </label>
          <input
            id="delete-account-confirm"
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            disabled={deleting}
            autoComplete="off"
            className="input w-full"
            placeholder={CONFIRM_PHRASE}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-[#E0EDEC] dark:border-[#253634] px-4 py-4 flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={deleting}
          className="flex-1 border-[1.5px] border-[#E0EDEC] dark:border-[#253634] rounded-full py-3 text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] hover:border-[#AACBC8] dark:hover:border-[#3D5652] transition-colors disabled:opacity-50"
        >
          {t('deleteAccountCancelButton')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canConfirm || deleting}
          className="flex-1 bg-red-600 text-white rounded-full py-3 text-[14px] font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {deleting ? t('deleteAccountDeleting') : t('deleteAccountConfirmButton')}
        </button>
      </div>
    </FullScreenModal>
  )
}
