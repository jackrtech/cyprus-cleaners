'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'

const MAX_BIO = 500

const CITIES: { key: string; value: string }[] = [
  { key: 'nicosia',   value: 'Nicosia' },
  { key: 'limassol',  value: 'Limassol' },
  { key: 'larnaca',   value: 'Larnaca' },
  { key: 'paphos',    value: 'Paphos' },
  { key: 'famagusta', value: 'Famagusta' },
  { key: 'paralimni', value: 'Paralimni' },
  { key: 'ayiaNapa',  value: 'Ayia Napa' },
  { key: 'protaras',  value: 'Protaras' },
]

const LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'EL', label: 'Greek' },
  { code: 'RU', label: 'Russian' },
]

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function EditProfilePage() {
  const t       = useTranslations('dashboard')
  const tCities = useTranslations('cities')
  const router  = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [success,      setSuccess]      = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null)
  const [profileSlug,  setProfileSlug]  = useState<string | null>(null)

  const [displayName,  setDisplayName]  = useState('')
  const [bio,          setBio]          = useState('')
  const [cities,       setCities]       = useState<string[]>([])
  const [cleanerType,  setCleanerType]  = useState<'individual' | 'company'>('individual')
  const [gender,       setGender]       = useState<'female' | 'male' | null>(null)
  const [hourlyRate,   setHourlyRate]   = useState('10')
  const [languages,    setLanguages]    = useState<string[]>([])
  const [availability, setAvailability] = useState<string[]>([])

  // Auth guard
  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (session.user.role === 'CUSTOMER') router.replace('/dashboard')
  }, [session, sessionStatus, router])

  // Fetch and populate form via API (uses admin client server-side, bypasses RLS)
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !session?.user.id) return
    fetch('/api/cleaner-profiles/me')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((data) => {
        setProfileSlug(data.slug ?? null)
        setDisplayName(data.display_name ?? '')
        setBio(data.bio ?? '')
        setCities((data.cities as string[]) ?? [])
        setCleanerType((data.cleaner_type as 'individual' | 'company') ?? 'individual')
        setGender((data.gender as 'female' | 'male' | null) ?? null)
        setHourlyRate(String(data.hourly_rate_eur ?? 10))
        setLanguages((data.languages as string[]) ?? [])
        setAvailability((data.availability as string[]) ?? [])
        if (data.photo_url) setPhotoPreview(data.photo_url as string)
      })
      .catch(() => setFetchError('Failed to load profile. Please refresh.'))
      .finally(() => setLoading(false))
  }, [session, sessionStatus])

  // Auto-dismiss success banner after 3 seconds
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(false), 3000)
    return () => clearTimeout(timer)
  }, [success])

  function toggleCity(value: string) {
    setCities(prev => prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value])
  }

  function toggleLanguage(code: string) {
    setLanguages(prev => prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code])
  }

  function toggleAvailability(value: string) {
    setAvailability(prev => prev.includes(value) ? prev.filter(a => a !== value) : [...prev, value])
  }

  function handleSetCleanerType(type: 'individual' | 'company') {
    setCleanerType(type)
    if (type === 'company') setGender(null)
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNewPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSuccess(false)

    if (cities.length === 0) { setFormError(t('atLeastOneCity')); return }
    if (languages.length === 0) { setFormError(t('atLeastOneLanguage')); return }

    setSaving(true)
    try {
      let photoUrl: string | undefined

      if (newPhotoFile) {
        const fd = new FormData()
        fd.append('photo', newPhotoFile)
        const uploadRes = await fetch('/api/cleaner-profiles/upload-photo', { method: 'POST', body: fd })
        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json()
          console.error('Photo upload error:', uploadData)
          throw new Error('Photo upload failed. Please try again.')
        }
        const { url } = await uploadRes.json()
        photoUrl = url
      }

      const body: Record<string, unknown> = {
        display_name:    displayName,
        bio:             bio.trim() || null,
        cities,
        hourly_rate_eur: Number(hourlyRate),
        cleaner_type:    cleanerType,
        gender:          cleanerType === 'company' ? null : gender,
        languages,
        availability,
      }
      if (photoUrl) body.photo_url = photoUrl

      const res = await fetch('/api/cleaner-profiles/me', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Save failed')
      }

      setSuccess(true)
      setNewPhotoFile(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (sessionStatus === 'loading' || !session || session.user.role === 'CUSTOMER') {
    return <div className="min-h-screen bg-[#F7FAF9]" />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8">
        <div className="max-w-[600px] mx-auto space-y-3">
          <div className="h-4 w-40 bg-[#E0EDEC] rounded animate-pulse" />
          <div className="card p-8 h-[500px] animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9] px-4 sm:px-10 py-8">
      <div className="max-w-[600px] mx-auto">

        {/* Back link */}
        <div className="mb-5">
          <Link href="/dashboard/cleaner" className="text-[13px] text-[#19706A] hover:underline">
            {t('backToDashboard')}
          </Link>
        </div>

        {/* Success banner — auto-dismisses after 3s */}
        {success && (
          <div className="bg-[#E8F4F3] border border-[#19706A] rounded-[10px] px-4 py-3 mb-5">
            <p className="text-[13px] text-[#19706A] font-medium">{t('profileSaved')}</p>
          </div>
        )}

        {/* Fetch error */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 mb-5">
            <p className="text-[13px] text-red-600">{fetchError}</p>
          </div>
        )}

        <div className="card p-8">
          <h1 className="text-[22px] font-medium text-[#0D1F1E] mb-6">{t('editProfileHeading')}</h1>

          <form onSubmit={handleSave} className="space-y-6">

            {/* Form-level error */}
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
                <p className="text-[13px] text-red-600">{formError}</p>
              </div>
            )}

            {/* 1. Profile photo */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('profilePhoto')}
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#E8F4F3] flex items-center justify-center overflow-hidden shrink-0">
                  {photoPreview
                    ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[#19706A] text-[20px] font-medium leading-none">
                        {getInitials(displayName) || '?'}
                      </span>
                  }
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary rounded-full px-4 py-2 text-[13px]"
                >
                  {t('uploadPhoto')}
                </button>
              </div>
            </div>

            {/* 2. Display name */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('displayName')}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                className="input w-full"
              />
            </div>

            {/* 3. Bio */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('bio')}
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, MAX_BIO))}
                rows={5}
                placeholder={t('bioPlaceholder')}
                className="input w-full resize-none"
              />
              <p className="text-[11px] text-[#6B8886] text-right mt-1">{bio.length}/{MAX_BIO}</p>
            </div>

            {/* 4. Cities */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('citiesLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {CITIES.map(city => {
                  const selected = cities.includes(city.value)
                  return (
                    <button
                      key={city.key}
                      type="button"
                      onClick={() => toggleCity(city.value)}
                      className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors ${
                        selected
                          ? 'bg-[#19706A] border-[#19706A] text-white'
                          : 'bg-white border-[#E0EDEC] text-[#0D1F1E] hover:border-[#19706A]'
                      }`}
                    >
                      {tCities(city.key as Parameters<typeof tCities>[0])}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 5. Hourly rate */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-1.5">
                {t('hourlyRate')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B8886] text-[14px] pointer-events-none">€</span>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(e.target.value)}
                  required
                  min={5}
                  step={1}
                  className="input w-full pl-7"
                />
              </div>
            </div>

            {/* 6. Account type */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('accountType')}
              </label>
              <div className="flex rounded-[10px] border border-[#E0EDEC] overflow-hidden">
                {(['individual', 'company'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSetCleanerType(type)}
                    className={`flex-1 py-2 text-[13px] transition-colors ${
                      cleanerType === type
                        ? 'bg-[#19706A] text-white'
                        : 'bg-white text-[#6B8886] hover:text-[#0D1F1E]'
                    }`}
                  >
                    {t(type)}
                  </button>
                ))}
              </div>
            </div>

            {/* 7. Gender — hidden for company */}
            {cleanerType === 'individual' && (
              <div>
                <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                  {t('gender')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { value: 'female' as const, label: t('female') },
                    { value: 'male'   as const, label: t('male') },
                    { value: null,               label: t('notApplicable') },
                  ] as const).map(opt => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setGender(opt.value)}
                      className={`px-4 py-1.5 rounded-full text-[13px] border transition-colors ${
                        gender === opt.value
                          ? 'bg-[#19706A] border-[#19706A] text-white'
                          : 'bg-white border-[#E0EDEC] text-[#0D1F1E] hover:border-[#19706A]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 8. Languages */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('languages')}
              </label>
              <div className="space-y-2.5">
                {LANGUAGES.map(lang => (
                  <label key={lang.code} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={languages.includes(lang.code)}
                      onChange={() => toggleLanguage(lang.code)}
                      className="w-4 h-4 accent-[#19706A]"
                    />
                    <span className="text-[13px] text-[#0D1F1E]">{lang.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 9. Availability */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('availability')}
              </label>
              <div className="space-y-2.5">
                {(['weekdays', 'weekends', 'evenings'] as const).map(slot => (
                  <label key={slot} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={availability.includes(slot)}
                      onChange={() => toggleAvailability(slot)}
                      className="w-4 h-4 accent-[#19706A]"
                    />
                    <span className="text-[13px] text-[#0D1F1E]">{t(slot)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 10. Services — pre-ticked, disabled */}
            <div>
              <label className="block text-[13px] font-medium text-[#0D1F1E] mb-2">
                {t('services')}
              </label>
              <label className="flex items-center gap-2.5 opacity-60 cursor-not-allowed select-none">
                <input type="checkbox" checked readOnly disabled className="w-4 h-4 accent-[#19706A]" />
                <span className="text-[13px] text-[#0D1F1E]">{t('houseCleaning')}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full py-3 rounded-full text-[14px] disabled:opacity-50"
            >
              {saving ? t('saving') : t('saveChanges')}
            </button>

          </form>
        </div>

        {/* View public profile link */}
        {profileSlug && (
          <div className="mt-4 text-center">
            <Link href={`/cleaners/${profileSlug}`} className="text-[13px] text-[#19706A] hover:underline">
              {t('viewPublicProfile')}
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
