'use client'

import { useTranslations } from 'next-intl'
import type { EarnedBadge } from '@/lib/badgeConstants'

// Renders a cleaner's earned badges as a row of small gold chips. Purely
// cosmetic/trust-signal (confirmed 2026-08-19: no effect on search ranking)
// -- badges is expected to already be display-collapsed via displayBadges()
// (highest tier only per milestone badge), this component doesn't do that
// itself so it stays a dumb renderer callers can also use for e.g. a
// dashboard summary without re-deriving the collapse logic differently.
export default function BadgeRow({ badges }: { badges: EarnedBadge[] }) {
  const t = useTranslations('profile')

  if (badges.length === 0) return null

  function labelFor(badge: EarnedBadge): string {
    switch (badge.badge_key) {
      case 'referred_friend':    return t('badgeReferredFriend')
      case 'completed_profile':  return t('badgeCompletedProfile')
      case 'verified_id':        return t('badgeVerifiedId')
      case 'cleans_milestone':   return badge.tier === '1' ? t('badgeFirstJob') : t('badgeCleansMilestone', { count: badge.tier })
      case 'tenure_milestone':
        return badge.tier === '1_month' ? t('badgeTenure1Month')
          : badge.tier === '6_months' ? t('badgeTenure6Months')
          : t('badgeTenure1Year')
    }
  }

  function iconFor(badgeKey: EarnedBadge['badge_key']): string {
    switch (badgeKey) {
      case 'referred_friend':   return '🤝'
      case 'completed_profile': return '✅'
      case 'verified_id':       return '🛡️'
      case 'cleans_milestone':  return '🧹'
      case 'tenure_milestone':  return '📅'
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map(badge => (
        <span key={`${badge.badge_key}-${badge.tier}`} className="badge badge-gold text-[11px]">
          <span aria-hidden="true" className="mr-1">{iconFor(badge.badge_key)}</span>
          {labelFor(badge)}
        </span>
      ))}
    </div>
  )
}
