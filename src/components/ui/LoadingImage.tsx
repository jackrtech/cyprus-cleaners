'use client'

import { useState } from 'react'

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  // Classes for the sizing/shape wrapper (width, height, aspect ratio,
  // rounding, border) — the img itself always fills it via w-full h-full.
  wrapperClassName?: string
}

// Drop-in <img> replacement that shows the app's own logo swirl (spinning)
// instead of the browser's default top-to-bottom progressive reveal, then
// cross-fades to the real image once it's loaded.
export default function LoadingImage({ className, wrapperClassName, onLoad, alt = '', ...imgProps }: Props) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`relative overflow-hidden ${wrapperClassName ?? ''}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F7FAF9]">
          <svg className="animate-spin" width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M22 10.5C22 10.5 19.5 8 16 8C11.582 8 8 11.582 8 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="8" cy="16" r="1.5" fill="#F2C94C" />
            <path d="M10 21.5C10 21.5 12.5 24 16 24C20.418 24 24 20.418 24 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="16" r="1.5" fill="#F2C94C" />
          </svg>
        </div>
      )}
      <img
        {...imgProps}
        alt={alt}
        className={`w-full h-full transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className ?? ''}`}
        onLoad={e => { setLoaded(true); onLoad?.(e) }}
      />
    </div>
  )
}
