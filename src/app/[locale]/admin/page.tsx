'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { extractErrorMessage } from '@/lib/utils'
import AdminNav from '@/components/admin/AdminNav'
import FullScreenModal from '@/components/ui/FullScreenModal'

interface VerificationUser {
  email: string
  phone: string | null
}

interface VerificationCleaner {
  id: string
  slug: string
  display_name: string
  photo_url: string | null
  city: string | null
  cities: string[] | null
  bio: string
  id_submitted_at: string
  id_photo_url: string | null
  selfie_photo_url: string | null
  created_at: string
  users: VerificationUser | null
}

export default function AdminPage() {
  const { data: session, status: sessionStatus } = useSession()
  const t      = useTranslations('admin')
  const locale = useLocale()
  const router = useRouter()

  const [queue,       setQueue]       = useState<VerificationCleaner[]>([])
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState<string | null>(null)
  const [pendingId,    setPendingId]   = useState<string | null>(null)
  const [actionError,  setActionError] = useState<string | null>(null)
  const [viewingId,    setViewingId]   = useState<string | null>(null)

  // Auth guard — middleware already gates /admin, this just handles the
  // client-side flash while the session resolves and covers a direct visit
  // by a non-admin whose token hasn't been re-checked yet.
  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [session, sessionStatus, router])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'ADMIN') return
    fetch('/api/admin/verifications')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (Array.isArray(data)) setQueue(data) })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
  }, [session, sessionStatus, t])

  async function handleAction(id: string, action: 'APPROVE' | 'REJECT') {
    if (pendingId) return
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/verifications/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, t('actionError')))
      setQueue(prev => prev.filter(c => c.id !== id))
      setViewingId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('actionError'))
    } finally {
      setPendingId(null)
    }
  }

  if (sessionStatus === 'loading' || !session || session.user.role !== 'ADMIN') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const viewing = queue.find(c => c.id === viewingId) ?? null

  return (
    <div className="min-h-screen bg-[#F7FAF9] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900">{t('title')}</h1>
            <p className="text-muted mt-1">{t('subtitle')}</p>
          </div>
          <button className="btn-ghost shrink-0" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {actionError && (
          <div className="mb-4 rounded-md bg-red-50 text-red-600 px-4 py-3 text-body">{actionError}</div>
        )}

        {loading && (
          <p className="text-muted">{t('loading')}</p>
        )}

        {!loading && error && (
          <p className="text-red-600">{error}</p>
        )}

        {!loading && !error && queue.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 font-medium">{t('empty')}</p>
            <p className="text-muted mt-1">{t('emptyBody')}</p>
          </div>
        )}

        {!loading && queue.length > 0 && (
          <ul className="space-y-3">
            {queue.map(cleaner => {
              const city = cleaner.cities?.[0] ?? cleaner.city
              return (
                <li key={cleaner.id}>
                  <button
                    type="button"
                    onClick={() => setViewingId(cleaner.id)}
                    className="card p-5 w-full text-left hover:border-teal-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-teal-900">{cleaner.display_name}</p>
                          {city && <span className="badge badge-teal">{city}</span>}
                        </div>
                        <p className="text-label uppercase tracking-widest text-muted mt-1">
                          {t('submitted', { date: dateFormatter.format(new Date(cleaner.id_submitted_at)) })}
                        </p>
                      </div>
                      <span className="text-teal-500 text-body font-medium shrink-0">{t('review')} →</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <FullScreenModal isOpen={!!viewing} onClose={() => setViewingId(null)}>
        {viewing && (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0EDEC] shrink-0">
              <p className="flex-1 min-w-0 text-[14px] font-medium text-[#0D1F1E] truncate">
                {viewing.display_name}
              </p>
              <button
                type="button"
                onClick={() => setViewingId(null)}
                aria-label="Close"
                className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] border border-[#E0EDEC] text-[#6B8886] hover:text-[#0D1F1E] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0"
              >
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  {viewing.users?.email && <p className="text-muted text-sm">{viewing.users.email}</p>}
                  {viewing.users?.phone && <p className="text-muted text-sm">{viewing.users.phone}</p>}
                </div>
                <Link
                  href={`/cleaners/${viewing.slug}`}
                  target="_blank"
                  className="btn-ghost !px-4 !py-2 text-[13px] shrink-0"
                >
                  {t('viewProfile')}
                </Link>
              </div>

              {viewing.bio && <p className="text-body text-teal-900">{viewing.bio}</p>}

              <p className="text-label uppercase tracking-widest text-muted">
                {t('submitted', { date: dateFormatter.format(new Date(viewing.id_submitted_at)) })}
              </p>

              {viewing.id_photo_url && (
                <div>
                  <p className="text-label uppercase tracking-widest text-muted mb-1">{t('idDocument')}</p>
                  <img
                    src={viewing.id_photo_url}
                    alt=""
                    className="w-full rounded-lg border border-border"
                  />
                </div>
              )}

              {viewing.selfie_photo_url && (
                <div>
                  <p className="text-label uppercase tracking-widest text-muted mb-1">{t('selfiePhoto')}</p>
                  <img
                    src={viewing.selfie_photo_url}
                    alt=""
                    className="w-full rounded-lg border border-border"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 px-4 py-3 border-t border-[#E0EDEC] shrink-0">
              <button
                className="btn-ghost flex-1"
                disabled={pendingId === viewing.id}
                onClick={() => handleAction(viewing.id, 'REJECT')}
              >
                {t('reject')}
              </button>
              <button
                className="btn-primary flex-1"
                disabled={pendingId === viewing.id}
                onClick={() => handleAction(viewing.id, 'APPROVE')}
              >
                {t('approve')}
              </button>
            </div>
          </>
        )}
      </FullScreenModal>
    </div>
  )
}
