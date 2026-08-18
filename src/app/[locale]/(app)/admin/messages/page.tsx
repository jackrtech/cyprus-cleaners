'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'
import AdminNav from '@/components/admin/AdminNav'
import FullScreenModal from '@/components/ui/FullScreenModal'
import SupportChatPanel from '@/components/support/SupportChatPanel'

interface SupportThreadApiRow {
  id:           string
  status:       'OPEN' | 'CLOSED'
  created_at:   string
  users:        { full_name: string; email: string; role: 'CUSTOMER' | 'CLEANER' | 'ADMIN' } | null
  last_message: { body: string | null; photo_path: string | null; system_event: string | null; created_at: string } | null
  has_unread:   boolean
}

interface ContactSubmission {
  id:          string
  name:        string
  email:       string
  message:     string
  created_at:  string
  resolved_at: string | null
}

type Row =
  | { type: 'support'; id: string; name: string; email: string; roleLabel: string; snippet: string; activityAt: string; open: boolean; hasUnread: boolean }
  | { type: 'contact'; id: string; name: string; email: string; snippet: string; activityAt: string; resolved: boolean }

export default function AdminMessagesPage() {
  const { data: session } = useSession()
  const t     = useTranslations('admin')
  const tNav  = useTranslations('nav')
  const tChat = useTranslations('chat')
  const locale = useLocale()

  const [threads,     setThreads]     = useState<SupportThreadApiRow[]>([])
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [actionPendingId, setActionPendingId] = useState<string | null>(null)

  const [viewingThreadId,     setViewingThreadId]     = useState<string | null>(null)
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user.role !== 'ADMIN') return
    Promise.all([
      fetch('/api/support/threads').then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/admin/contact').then(r => r.ok ? r.json() : Promise.reject()),
    ])
      .then(([threadData, submissionData]) => {
        setThreads(threadData)
        setSubmissions(submissionData)
      })
      .catch(() => setError(t('messagesLoadError')))
      .finally(() => setLoading(false))
  }, [session, t])

  const rows: Row[] = useMemo(() => {
    const supportRows: Row[] = threads.map(th => ({
      type:       'support',
      id:         th.id,
      name:       th.users?.full_name ?? '—',
      email:      th.users?.email ?? '',
      roleLabel:  th.users?.role === 'CUSTOMER' ? tNav('roleCustomer') : th.users?.role === 'CLEANER' ? tNav('roleCleaner') : '',
      snippet:    th.last_message?.system_event
        ? ''
        : th.last_message?.body ?? (th.last_message?.photo_path ? tChat('photoMessage') : ''),
      activityAt: th.last_message?.created_at ?? th.created_at,
      open:       th.status === 'OPEN',
      hasUnread:  th.has_unread,
    }))
    const contactRows: Row[] = submissions.map(s => ({
      type:       'contact',
      id:         s.id,
      name:       s.name,
      email:      s.email,
      snippet:    s.message,
      activityAt: s.created_at,
      resolved:   !!s.resolved_at,
    }))
    return [...supportRows, ...contactRows].sort(
      (a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime()
    )
  }, [threads, submissions, tNav, tChat])

  async function handleToggleThread(id: string, currentlyOpen: boolean) {
    if (actionPendingId) return
    setActionPendingId(id)
    try {
      const res = await fetch(`/api/support/threads/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ closed: currentlyOpen }),
      })
      if (!res.ok) throw new Error()
      setThreads(prev => prev.map(th => th.id === id ? { ...th, status: currentlyOpen ? 'CLOSED' : 'OPEN' } : th))
    } catch {
      // no-op — row just won't reflect the change; user can retry
    } finally {
      setActionPendingId(null)
    }
  }

  async function handleToggleSubmission(id: string, resolve: boolean) {
    if (actionPendingId) return
    setActionPendingId(id)
    try {
      const res = await fetch(`/api/admin/contact/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resolved: resolve }),
      })
      if (!res.ok) throw new Error()
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, resolved_at: resolve ? new Date().toISOString() : null } : s))
    } catch {
      // no-op
    } finally {
      setActionPendingId(null)
    }
  }

  // (app)/layout.tsx already gates loading/auth/role — this is pure TS
  // narrowing for the session-shaped code below, never actually renders.
  if (!session) return null

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const viewingThread = threads.find(th => th.id === viewingThreadId) ?? null
  const viewingSubmission = submissions.find(s => s.id === viewingSubmissionId) ?? null

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-8 sm:pt-12">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 font-display text-teal-900 dark:text-[#ECF3F2]">{t('messagesTitle')}</h1>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('messagesSubtitle')}</p>
          </div>
          <button className="btn-ghost shrink-0" onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('signOut')}
          </button>
        </div>

        <AdminNav />

        {loading && <p className="text-muted dark:text-[#9BB0AE]">{t('loading')}</p>}
        {!loading && error && <p className="text-red-600">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-teal-900 dark:text-[#ECF3F2] font-medium">{t('messagesEmpty')}</p>
            <p className="text-muted dark:text-[#9BB0AE] mt-1">{t('messagesEmptyBody')}</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map(row => (
              <li key={`${row.type}-${row.id}`} className="card p-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => row.type === 'support' ? setViewingThreadId(row.id) : setViewingSubmissionId(row.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-teal-900 dark:text-[#ECF3F2] truncate">{row.name}</span>
                    {row.type === 'support' && row.roleLabel && <span className="badge badge-teal">{row.roleLabel}</span>}
                    <span className="badge">{row.type === 'support' ? t('supportBadge') : t('contactBadge')}</span>
                    {row.type === 'support' && row.hasUnread && (
                      <span className="w-2 h-2 rounded-full bg-[#19706A] shrink-0" aria-hidden="true" />
                    )}
                  </div>
                  {row.snippet && (
                    <p className="text-muted dark:text-[#9BB0AE] text-sm truncate">{row.snippet}</p>
                  )}
                  <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE] mt-1">
                    {dateFormatter.format(new Date(row.activityAt))}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={actionPendingId === row.id}
                  onClick={() => row.type === 'support'
                    ? handleToggleThread(row.id, row.open)
                    : handleToggleSubmission(row.id, !row.resolved)}
                  className="btn-ghost !px-3 !py-1.5 text-[12px] shrink-0 disabled:opacity-50"
                >
                  {row.type === 'support'
                    ? (row.open ? t('markResolved') : t('reopen'))
                    : (row.resolved ? t('reopen') : t('markResolved'))}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FullScreenModal isOpen={!!viewingThreadId} onClose={() => setViewingThreadId(null)}>
        {viewingThread && (
          <SupportChatPanel
            threadId={viewingThread.id}
            currentUserId={session.user.id}
            otherPartyName={viewingThread.users?.full_name ?? '—'}
            onClose={() => setViewingThreadId(null)}
          />
        )}
      </FullScreenModal>

      <FullScreenModal isOpen={!!viewingSubmissionId} onClose={() => setViewingSubmissionId(null)}>
        {viewingSubmission && (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0EDEC] dark:border-[#253634] shrink-0">
              <p className="flex-1 min-w-0 text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">
                {viewingSubmission.name}
              </p>
              <button
                type="button"
                onClick={() => setViewingSubmissionId(null)}
                aria-label="Close"
                className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F7FAF9] dark:bg-[#0F1817] border border-[#E0EDEC] dark:border-[#253634] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] hover:border-[#19706A] transition-colors text-[20px] leading-none shrink-0"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <p className="text-muted dark:text-[#9BB0AE] text-sm">{viewingSubmission.email}</p>
              <p className="text-body text-teal-900 dark:text-[#ECF3F2] whitespace-pre-wrap">{viewingSubmission.message}</p>
              <p className="text-label uppercase tracking-widest text-muted dark:text-[#9BB0AE]">
                {dateFormatter.format(new Date(viewingSubmission.created_at))}
              </p>
            </div>
            <div className="px-4 py-3 border-t border-[#E0EDEC] dark:border-[#253634] shrink-0">
              <button
                className="btn-primary w-full"
                disabled={actionPendingId === viewingSubmission.id}
                onClick={() => handleToggleSubmission(viewingSubmission.id, !viewingSubmission.resolved_at)}
              >
                {viewingSubmission.resolved_at ? t('reopen') : t('markResolved')}
              </button>
            </div>
          </>
        )}
      </FullScreenModal>
    </div>
  )
}
