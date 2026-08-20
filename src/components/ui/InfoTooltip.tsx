'use client'

import { useEffect, useId, useRef, useState } from 'react'

interface InfoTooltipProps {
  // Accessible name for the trigger button (e.g. "What is Total bookings?")
  // — must be translated by the caller, no English-only labels.
  label: string
  children: React.ReactNode
}

const TOOLTIP_WIDTH = 224 // px — matches the w-56 the popup used to be styled with
const VIEWPORT_MARGIN = 8 // px — minimum gap kept from either screen edge

// A small "i" trigger that reveals a definition on click/tap — not hover-only,
// so it works the same for mouse, touch, and keyboard (Tab to focus, Enter/
// Space to toggle, same as any button). Closes on Escape or an outside click.
//
// Positioned with fixed + a measured, viewport-clamped left offset rather
// than CSS left-1/2/-translate-x-1/2 centered-on-trigger — the metric cards
// this renders inside get down to ~165px wide on a narrow phone screen, so a
// naively-centered 224px popup routinely overflowed off the right edge of
// the screen (confirmed 2026-08-20 by constraining a live page to 375px and
// opening one of the right-column tooltips — the popup extended well past
// the viewport boundary). Clamping to [8, viewportWidth - width - 8] keeps
// it fully on-screen at any trigger position or viewport width.
export default function InfoTooltip({ label, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) return

    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const idealLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
      const maxLeft = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN
      const left = Math.min(Math.max(idealLeft, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN))
      setCoords({ top: rect.bottom + 6, left })
    }
    place()

    function onDocPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  return (
    <span className="relative inline-block align-middle" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen(o => !o)}
        className="ml-1 w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-[#C5D8D6] dark:border-[#3A4E4C] text-[9px] font-medium leading-none text-[#5B7472] dark:text-[#9BB0AE] hover:border-[#19706A] hover:text-[#19706A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19706A] transition-colors"
      >
        i
      </button>
      {open && coords && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{ top: coords.top, left: coords.left, width: TOOLTIP_WIDTH }}
          className="fixed z-20 rounded-md bg-[#0D1F1E] dark:bg-[#ECF3F2] text-white dark:text-[#0D1F1E] text-[12px] leading-snug normal-case tracking-normal font-normal px-3 py-2 shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  )
}
