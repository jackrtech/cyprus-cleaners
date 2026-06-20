import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'

export default function GetStartedPage() {
  const t = useTranslations('getStarted')

  return (
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[600px]">
        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-medium text-[#0D1F1E] tracking-tight mb-2">
            {t('heading')}
          </h1>
          <p className="text-[14px] text-[#6B8886]">{t('subtitle')}</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Customer card */}
          <div className="card p-6 flex flex-col items-center text-center">
            <span className="text-[48px] mb-4 leading-none">🏠</span>
            <h2 className="text-[17px] font-medium text-[#0D1F1E] mb-2">
              {t('customerHeading')}
            </h2>
            <p className="text-[13px] text-[#6B8886] leading-relaxed mb-6 flex-1">
              {t('customerBody')}
            </p>
            <Link href="/register" className="btn-primary w-full text-center">
              {t('customerCta')}
            </Link>
          </div>

          {/* Cleaner card */}
          <div className="card p-6 flex flex-col items-center text-center">
            <span className="text-[48px] mb-4 leading-none">✨</span>
            <h2 className="text-[17px] font-medium text-[#0D1F1E] mb-2">
              {t('cleanerHeading')}
            </h2>
            <p className="text-[13px] text-[#6B8886] leading-relaxed mb-6 flex-1">
              {t('cleanerBody')}
            </p>
            <Link href="/for-cleaners" className="btn-secondary w-full text-center">
              {t('cleanerCta')}
            </Link>
          </div>
        </div>

        {/* Sign in link */}
        <p className="text-center text-[13px] text-[#6B8886] mt-6">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/login" className="text-[#19706A] hover:underline font-medium">
            {t('signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
