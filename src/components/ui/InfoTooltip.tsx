'use client'

import { useEffect, useId, useRef, useState } from 'react'

interface InfoTooltipProps {
  // Accessible name for the trigger button (e.g. "What is Total bookings?")
  // — must be translated by the caller, no English-only labels.
  label: string
  children: React.ReactNode
}

// A small "i" trigger that reveals a definition on click/tap — not hover-only,
// so it works the same for mouse, touch, and keyboard (Tab to focus, Enter/
// Space to toggle, same as any button). Closes on Escape or an outside click.
export default function InfoTooltip({ label, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span className="relative inline-block align-middle" ref={wrapperRef}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen(o => !o)}
        className="ml-1 w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-[#C5D8D6] dark:border-[#3A4E4C] text-[9px] font-medium leading-none text-[#5B7472] dark:text-[#9BB0AE] hover:border-[#19706A] hover:text-[#19706A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19706A] transition-colors"
      >
        i
      </button>
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 rounded-md bg-[#0D1F1E] dark:bg-[#ECF3F2] text-white dark:text-[#0D1F1E] text-[12px] leading-snug normal-case tracking-normal font-normal px-3 py-2 shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  )
}
