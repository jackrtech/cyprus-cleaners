'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/navigation'
import { extractErrorMessage } from '@/lib/utils'
import AdminNav from '@/components/admin/AdminNav'

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

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
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
          <ul className="space-y-4">
            {queue.map(cleaner => {
              const city = cleaner.cities?.[0] ?? cleaner.city
              return (
                <li key={cleaner.id} className="card p-5">
                  <div className="flex gap-4">
                    {cleaner.photo_url ? (
                      <img
                        src={cleaner.photo_url}
                        alt=""
                        className="w-16 h-16 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center font-medium shrink-0">
                        {getInitials(cleaner.display_name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-teal-900">{cleaner.display_name}</p>
                        {city && <span className="badge badge-teal">{city}</span>}
                      </div>
                      {cleaner.users?.email && (
                        <p className="text-muted text-sm mt-0.5">{cleaner.users.email}</p>
                      )}
                      {cleaner.users?.phone && (
                        <p className="text-muted text-sm">{cleaner.users.phone}</p>
                      )}
                      {cleaner.bio && (
                        <p className="text-body text-teal-900 mt-2 line-clamp-3">{cleaner.bio}</p>
                      )}
                      <p className="text-label uppercase tracking-widest text-muted mt-3">
                        {t('submitted', { date: dateFormatter.format(new Date(cleaner.id_submitted_at)) })}
                      </p>
                    </div>
                  </div>
                  {(cleaner.id_photo_url || cleaner.selfie_photo_url) && (
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      {cleaner.id_photo_url && (
                        <div>
                          <p className="text-label uppercase tracking-widest text-muted mb-1">{t('idDocument')}</p>
                          <a href={cleaner.id_photo_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={cleaner.id_photo_url}
                              alt=""
                              className="w-full aspect-[4/3] object-cover rounded-lg border border-border"
                            />
                          </a>
                        </div>
                      )}
                      {cleaner.selfie_photo_url && (
                        <div>
                          <p className="text-label uppercase tracking-widest text-muted mb-1">{t('selfiePhoto')}</p>
                          <a href={cleaner.selfie_photo_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={cleaner.selfie_photo_url}
                              alt=""
                              className="w-full aspect-[4/3] object-cover rounded-lg border border-border"
                            />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4 justify-end">
                    <button
                      className="btn-ghost"
                      disabled={pendingId === cleaner.id}
                      onClick={() => handleAction(cleaner.id, 'REJECT')}
                    >
                      {t('reject')}
                    </button>
                    <button
                      className="btn-primary"
                      disabled={pendingId === cleaner.id}
                      onClick={() => handleAction(cleaner.id, 'APPROVE')}
                    >
                      {t('approve')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
