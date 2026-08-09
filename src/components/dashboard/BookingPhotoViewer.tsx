'use client'

interface Props {
  isOpen:    boolean
  onClose:   () => void
  photoUrls: string[]
  title?:    string
}

// Full-screen photo viewer for a completed booking's job photos — mirrors the
// mobile chat takeover (fixed, full-viewport, own close button). Only rendered
// while open, so a booking history full of past jobs doesn't eagerly download
// every photo on dashboard load; the dashboard list itself just shows a photo
// count and fetches nothing until this is opened.
export default function BookingPhotoViewer({ isOpen, onClose, photoUrls, title }: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-white"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0EDEC] shrink-0">
        <span className="text-[14px] font-medium text-[#0D1F1E] truncate">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[#6B8886] hover:text-[#0D1F1E] transition-colors text-[22px] leading-none shrink-0 ml-2"
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photoUrls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt="" className="w-full aspect-square rounded-lg object-cover border border-[#E0EDEC]" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
