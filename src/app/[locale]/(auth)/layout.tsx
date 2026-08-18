import { Link } from '@/navigation'

// Deliberately minimal — just a logo back to the marketing site, no full nav
// or footer. Auth/signup screens want to minimize distraction and drop-off,
// not offer a way to wander off into marketing content mid-flow.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="px-6 lg:px-12 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#E8F4F3" />
            <path d="M22 10.5C22 10.5 19.5 8 16 8C11.582 8 8 11.582 8 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="8" cy="16" r="1.5" fill="#F2C94C" />
            <path d="M10 21.5C10 21.5 12.5 24 16 24C20.418 24 24 20.418 24 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="16" r="1.5" fill="#F2C94C" />
          </svg>
          <span className="text-[17px] font-medium text-[#19706A] tracking-tight">Cyprus Cleaners</span>
        </Link>
      </header>
      <main id="main-content">{children}</main>
    </>
  )
}
