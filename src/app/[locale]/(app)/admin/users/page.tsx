'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { extractErrorMessage } from '@/lib/utils'
import AdminNav from '@/components/admin/AdminNav'

type CleanerStatus = 'ACTIVE' | 'PAUSED' | 'SUSPENDED'

interface CleanerProfileSummary {
  id:       string
  status:   CleanerStatus
  verified: boolean
}

interface DisputeHistory {
  total:         number
  autoResolved:  number
  adminResolved: number
}

interface AdminUser {
  id:                  string
  email:               string
  full_name:           string
  role:                'CUSTOMER' | 'CLEANER' | 'ADMIN'
  email_verified:      boolean
  created_at:          string
  cleaner_profile:     CleanerProfileSummary | null
  dispute_history:     DisputeHistory | null
  failed_payout_count: number
}

const CLEANER_STATUS_BADGE: Record<CleanerStatus, string> = {
  ACTIVE:    'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300',
  PAUSED:    'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300',
  SUSPENDED: 'bg-red-50 text-red-600',
}

export default function AdminUsersPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const tNav   = useTranslations('nav')
  const locale = useLocale()

  const [users,   setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [pendingId,   setPendingId]   = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)


  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/users')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setUsers(data) })
      .catch(() => setError(t('usersLoadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  async function handleSetCleanerStatus(userId: string, status: CleanerStatus) {
    if (pendingId) return
    setPendingId(userId)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cleaner_status: status }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('cleanerStatusUpdateError')))
      setUsers(prev => prev.map(u =>
        u.id === userId && u.cleaner_profile ? { ...u, cleaner_profile: { ...u.cleaner_profile, status } } : u
      ))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('cleanerStatusUpdateError'))
    } finally {
      setPendingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(u => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, search])

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const roleLabel = (role: AdminUser['role']) =>
    role === 'CUSTOMER' ? tNav('roleCustomer') : role === 'CLEANER' ? tNav('roleCleaner') : tNav('admin')

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('usersTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('usersSubtitle')}</p>
          </div>
          {/* md:hidden — Navbar already renders its own Sign out on desktop;
              this is mobile-only, since neither Navbar (hidden on mobile
              when logged in) nor BottomTabBar (ADMIN isn't CUSTOMER/CLEANER,
              so it never renders) give an ADMIN any other way to sign out
              on mobile. Fixes the desktop duplicate-button bug, 2026-08-19. */}
          <button className="btn-ghost shrink-0 md:hidden" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {actionError && (
          <div className="mb-4 rounded-md bg-red-50 text-red-600 px-4 py-3 text-body">{actionError}</div>
        )}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchUsersPlaceholder')}
          className="input mb-6"
        />

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}

        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('usersEmpty')}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map(u => (
              <li key={u.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-teal-900 dark:text-[#ECF3F2]">{u.full_name}</p>
                    <p className="text-body text-muted dark:text-[#9BB0AE]">{u.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="badge badge-teal">{roleLabel(u.role)}</span>
                    <span className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE]">
                      {t('joined', { date: dateFormatter.format(new Date(u.created_at)) })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className={`badge ${u.email_verified ? 'bg-teal-50 dark:bg-[#17302D] text-teal-600 dark:text-teal-300' : 'bg-gold-50 dark:bg-[#332B0F] text-gold-700 dark:text-gold-300'}`}>
                    {u.email_verified ? t('emailVerifiedBadge') : t('emailUnverifiedBadge')}
                  </span>
                  {u.cleaner_profile && (
                    <span className={`badge ${CLEANER_STATUS_BADGE[u.cleaner_profile.status]}`}>
                      {t(`cleanerStatus${u.cleaner_profile.status.charAt(0)}${u.cleaner_profile.status.slice(1).toLowerCase()}`)}
                    </span>
                  )}
                </div>

                {u.dispute_history && u.dispute_history.total > 0 && (
                  <p className="text-body text-muted dark:text-[#9BB0AE] mt-2">
                    {t('disputeHistory', {
                      total:         u.dispute_history.total,
                      autoResolved:  u.dispute_history.autoResolved,
                      adminResolved: u.dispute_history.adminResolved,
                    })}
                  </p>
                )}

                {u.failed_payout_count > 0 && (
                  <p className="text-body text-red-600 mt-2">
                    {t('failedPayoutCount', { count: u.failed_payout_count })}
                  </p>
                )}

                {u.cleaner_profile && (
                  <div className="flex items-center gap-3 mt-3">
                    {u.cleaner_profile.status !== 'ACTIVE' && (
                      <button
                        className="btn-secondary !px-3 !py-1.5 text-body"
                        disabled={pendingId === u.id}
                        onClick={() => handleSetCleanerStatus(u.id, 'ACTIVE')}
                      >
                        {t('reactivateCleaner')}
                      </button>
                    )}
                    {u.cleaner_profile.status !== 'PAUSED' && (
                      <button
                        className="btn-ghost !px-3 !py-1.5 text-body"
                        disabled={pendingId === u.id}
                        onClick={() => handleSetCleanerStatus(u.id, 'PAUSED')}
                      >
                        {t('pauseCleaner')}
                      </button>
                    )}
                    {u.cleaner_profile.status !== 'SUSPENDED' && (
                      <button
                        className="btn-ghost !px-3 !py-1.5 text-body !text-red-600"
                        disabled={pendingId === u.id}
                        onClick={() => handleSetCleanerStatus(u.id, 'SUSPENDED')}
                      >
                        {t('suspendCleaner')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
