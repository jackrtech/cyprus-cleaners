'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import LanguageToggle from '@/components/layout/LanguageToggle'
import ThemeToggle from '@/components/ui/ThemeToggle'
import AddressFormModal, { type SavedAddress } from '@/components/addresses/AddressFormModal'
import LoadingImage from '@/components/ui/LoadingImage'

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function ProfilePage() {
  const { data: session, status: sessionStatus } = useSession()
  const t = useTranslations('dashboard')
  const tNav = useTranslations('nav')
  const tAddr = useTranslations('address')
  const tCommon = useTranslations('common')

  const [cleanerSlug, setCleanerSlug] = useState<string | null>(null)
  const [cleanerPhotoUrl, setCleanerPhotoUrl] = useState<string | null>(null)

  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [showAddressModal, setShowAddressModal] = useState(false)

  useEffect(() => {
    if (session?.user.role !== 'CLEANER') return
    fetch('/api/cleaner-profiles/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.slug) setCleanerSlug(d.slug)
        if (d?.photo_url) setCleanerPhotoUrl(d.photo_url)
      })
      .catch(() => {})
  }, [session])

  useEffect(() => {
    if (session?.user.role !== 'CUSTOMER') return
    fetch('/api/addresses')
      .then(r => r.ok ? r.json() : [])
      .then((data: SavedAddress[]) => setAddresses(data))
      .catch(() => {})
  }, [session])

  // (app)/layout.tsx already gates loading/auth — this is pure TS narrowing
  // for the session-shaped code below, never actually renders.
  if (!session) return null

  const role = session.user.role
  const roleLabel = role === 'CUSTOMER' ? tNav('roleCustomer')
    : role === 'CLEANER' ? tNav('roleCleaner')
    : tNav('admin')

  function formatAddress(a: SavedAddress): string {
    const place = a.area ? `${a.area}, ${a.city}` : a.city
    return a.label ? `${a.label} — ${a.line1}, ${place}` : `${a.line1}, ${place}`
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] px-4 sm:px-10 py-8 pb-tabbar md:pb-8">
      <div className="max-w-[720px] mx-auto space-y-6">
        <h1 className="text-[24px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{t('yourAccount')}</h1>

        <div className="card p-5 flex items-center gap-4">
          <div className="shrink-0 w-14 h-14 rounded-full bg-[#19706A] flex items-center justify-center text-white text-[16px] font-medium overflow-hidden">
            {cleanerPhotoUrl
              ? <LoadingImage src={cleanerPhotoUrl} wrapperClassName="w-full h-full" className="object-cover" />
              : getInitials(session.user.name ?? '')}
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2] truncate">{session.user.name}</p>
            <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] truncate">{session.user.email}</p>
            <span className="inline-block mt-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A]">
              {roleLabel}
            </span>
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between gap-3">
          <span className="text-[14px] text-[#0D1F1E] dark:text-[#ECF3F2]">{tNav('language')}</span>
          <LanguageToggle />
        </div>

        <div className="card p-5 flex items-center justify-between gap-3">
          <span className="text-[14px] text-[#0D1F1E] dark:text-[#ECF3F2]">{tCommon('appearance')}</span>
          <ThemeToggle />
        </div>

        {role === 'CLEANER' && (
          <div className="card divide-y divide-[#E0EDEC] dark:divide-[#253634]">
            <Link href="/dashboard/cleaner/edit" className="flex items-center justify-between px-5 py-4 hover:bg-[#F7FAF9] dark:hover:bg-[#0F1817] transition-colors">
              <span className="text-[14px] text-[#0D1F1E] dark:text-[#ECF3F2]">{t('editProfile')}</span>
              <span className="text-[#5B7472] dark:text-[#9BB0AE]" aria-hidden="true">›</span>
            </Link>
            {cleanerSlug && (
              <Link href={`/cleaners/${cleanerSlug}`} className="flex items-center justify-between px-5 py-4 hover:bg-[#F7FAF9] dark:hover:bg-[#0F1817] transition-colors">
                <span className="text-[14px] text-[#0D1F1E] dark:text-[#ECF3F2]">{t('viewPublicProfile')}</span>
                <span className="text-[#5B7472] dark:text-[#9BB0AE]" aria-hidden="true">›</span>
              </Link>
            )}
          </div>
        )}

        {role === 'CUSTOMER' && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-medium text-[#0D1F1E] dark:text-[#ECF3F2]">{tAddr('yourAddresses')}</span>
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="text-[13px] font-medium text-[#19706A] hover:underline"
              >
                {tAddr('addNew')}
              </button>
            </div>
            {addresses.length > 0 ? (
              <div className="space-y-1.5">
                {addresses.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    className="w-full text-left text-[13px] text-[#0D1F1E] dark:text-[#ECF3F2] hover:text-[#19706A] transition-colors rounded-[10px] border border-[#E0EDEC] dark:border-[#253634] px-3 py-2.5 truncate"
                  >
                    {a.is_default && <span className="text-[11px] font-medium text-[#19706A] mr-1.5">{tAddr('defaultBadge')}</span>}
                    {formatAddress(a)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE]">{tAddr('noAddressesYet')}</p>
            )}
          </div>
        )}

        <div className="text-center pt-2">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-[13px] text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2] transition-colors"
          >
            {t('signOut')}
          </button>
        </div>
      </div>

      {role === 'CUSTOMER' && (
        <AddressFormModal
          isOpen={showAddressModal}
          onClose={() => setShowAddressModal(false)}
          addresses={addresses}
          mode="manage"
          onSaved={address => {
            setAddresses(prev => prev.some(a => a.id === address.id)
              ? prev.map(a => a.id === address.id ? address : a)
              : [...prev, address])
          }}
          onDefaultChanged={id => setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id })))}
          onDeleted={id => setAddresses(prev => prev.filter(a => a.id !== id))}
        />
      )}
    </div>
  )
}
