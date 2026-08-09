'use client'

interface Props {
  isOpen:   boolean
  onClose:  () => void
  children: React.ReactNode
}

// Shared modal shell: a full-viewport takeover on mobile (nothing to
// accidentally scroll past) and a normal centered card with a dimmed
// backdrop on desktop — the same behavior chat, booking details, and address
// forms all want, kept in one place instead of three slightly-different
// copies of the same responsive logic.
export default function FullScreenModal({ isOpen, onClose, children }: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[300] max-md:bg-white md:bg-[rgba(13,31,30,0.5)] md:flex md:items-center md:justify-center md:px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full h-full md:h-auto md:max-w-[560px] md:max-h-[85vh] bg-white flex flex-col md:rounded-[16px] md:border md:border-[#E0EDEC] overflow-hidden">
        {children}
      </div>
    </div>
  )
}
