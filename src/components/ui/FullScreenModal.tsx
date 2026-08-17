'use client'

import { useEffect, useRef } from 'react'

interface Props {
  isOpen:   boolean
  onClose:  () => void
  children: React.ReactNode
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Shared modal shell: a full-viewport takeover on mobile (nothing to
// accidentally scroll past) and a normal centered card with a dimmed
// backdrop on desktop — the same behavior chat, booking details, and address
// forms all want, kept in one place instead of three slightly-different
// copies of the same responsive logic.
//
// Also the one place dialog accessibility (focus trap, Escape to close,
// focus restored to whatever opened it, role="dialog") needs to be right —
// every modal in the app shares this shell, so fixing it here fixes all of
// them at once.
export default function FullScreenModal({ isOpen, onClose, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // Kept in a ref rather than the effect's dependency array — callers
  // typically pass an inline `() => setX(false)`, a fresh reference every
  // render, which would otherwise tear the listener down and restore focus
  // on every parent re-render while the modal is still open.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const firstFocusable = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(firstFocusable ?? container)?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !container) return

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null)
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[300] max-md:bg-white md:bg-[rgba(13,31,30,0.5)] md:flex md:items-center md:justify-center md:px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full h-full md:h-auto md:max-w-[560px] md:max-h-[85vh] bg-white flex flex-col md:rounded-[16px] md:border md:border-[#E0EDEC] dark:md:border-[#253634] overflow-hidden outline-none"
      >
        {children}
      </div>
    </div>
  )
}
