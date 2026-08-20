'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export const REFERRAL_STORAGE_KEY = 'cc_referral_code'

// Renders nothing -- stashes ?ref=<code> into sessionStorage the moment
// someone lands on /get-started via a cleaner's referral link, so it
// survives the get-started -> for-cleaners -> register/cleaner hop even
// though those are separate page loads. Read back in register/cleaner's own
// handleSubmit; see src/lib/referrals.ts / src/lib/badges.ts for the rest of
// the referral flow.
export default function ReferralCapture() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) sessionStorage.setItem(REFERRAL_STORAGE_KEY, ref)
  }, [searchParams])

  return null
}
