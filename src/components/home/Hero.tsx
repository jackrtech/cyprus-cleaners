'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'

type ServiceTab = 'HOUSE' | 'APARTMENT'

export default function Hero() {
  const t = useTranslations('hero')
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ServiceTab>('HOUSE')

  return (
    <section className="relative w-full bg-[#F7FAF9] overflow-hidden">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          /* Blob glow */
          @keyframes blobPulse {
            0%, 100% { opacity: 0.025; }
            50%       { opacity: 0.05; }
          }
          @keyframes blobPulseDelayed {
            0%, 100% { opacity: 0.025; }
            50%       { opacity: 0.05; }
          }

          /* Curve draw-in */
          @keyframes drawC {
            from { stroke-dashoffset: 900; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes drawS {
            from { stroke-dashoffset: 1100; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes drawS2 {
            from { stroke-dashoffset: 800; }
            to   { stroke-dashoffset: 0; }
          }

          /* Gold dot pulse */
          @keyframes dotPulse {
            0%, 100% { r: 3;   opacity: 0.7; }
            50%       { r: 4.5; opacity: 1;   }
          }
          @keyframes dotPulse2 {
            0%, 100% { r: 2;   opacity: 0.7; }
            50%       { r: 3.5; opacity: 1;   }
          }
          @keyframes dotPulse3 {
            0%, 100% { r: 2.5; opacity: 0.7; }
            50%       { r: 4;   opacity: 1;   }
          }

          /* Float card */
          @keyframes floatCard {
            0%, 100% { transform: translateY(0); }
            50%       { transform: translateY(-5px); }
          }

          .blob-a  { animation: blobPulse        4s ease-in-out infinite; }
          .blob-b  { animation: blobPulseDelayed 4s ease-in-out infinite 0.8s; }

          .curve-c  { animation: drawC  2.4s cubic-bezier(.4,0,.2,1) forwards; }
          .curve-s  { animation: drawS  2.8s cubic-bezier(.4,0,.2,1) 0.3s forwards; }
          .curve-s2 { animation: drawS2 2.2s cubic-bezier(.4,0,.2,1) 0.6s forwards; }

          .dot-1 { animation: dotPulse  2.5s ease-in-out infinite 2.4s; }
          .dot-2 { animation: dotPulse2 2.5s ease-in-out infinite 2.8s; }
          .dot-3 { animation: dotPulse3 2.5s ease-in-out infinite 3.1s; }

          .float-card { animation: floatCard 4s ease-in-out infinite 1s; }
        }
      `}</style>

      {/* ── Background SVG curves ── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 900 520"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {/* Soft blobs */}
        <circle className="blob-a" cx="160" cy="420" r="180" fill="#19706A" style={{ opacity: 0.025 }} />
        <circle className="blob-b" cx="820" cy="80"  r="120" fill="#19706A" style={{ opacity: 0.025 }} />

        {/* C-arc */}
        <path
          className="curve-c"
          d="M80 480 C60 360, 20 280, 60 180 C90 100, 150 60, 180 20"
          stroke="#19706A" strokeWidth="1.5" strokeOpacity="0.18"
          fill="none" strokeLinecap="round"
          strokeDasharray="900" strokeDashoffset="900"
        />

        {/* S-arc */}
        <path
          className="curve-s"
          d="M40 500 C100 440, 60 340, 110 260 C160 180, 220 160, 200 80 C185 20, 140 -10, 100 -30"
          stroke="#19706A" strokeWidth="1" strokeOpacity="0.10"
          fill="none" strokeLinecap="round"
          strokeDasharray="1100" strokeDashoffset="1100"
        />

        {/* S-arc2 */}
        <path
          className="curve-s2"
          d="M750 -20 C790 60, 820 120, 800 200 C780 280, 740 300, 760 380"
          stroke="#19706A" strokeWidth="1.2" strokeOpacity="0.09"
          fill="none" strokeLinecap="round"
          strokeDasharray="800" strokeDashoffset="800"
        />

        {/* Gold dot terminals */}
        <circle className="dot-1" cx="178" cy="22"  r="3"   fill="#F2C94C" opacity="0" />
        <circle className="dot-2" cx="60"  cy="182" r="2"   fill="#F2C94C" opacity="0" />
        <circle className="dot-3" cx="758" cy="382" r="2.5" fill="#F2C94C" opacity="0" />
      </svg>

      {/* ── Two-column grid ── */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 min-h-[520px]">

        {/* Left content column */}
        <div className="flex flex-col justify-center px-6 py-16 md:pl-14 md:pr-0 md:py-[72px]">
          <div className="max-w-[460px]">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#E8F4F3] rounded-[6px] px-3 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#19706A] shrink-0" />
              <span className="text-[11px] font-medium text-[#19706A] tracking-[0.07em] uppercase">
                {t('badge')}
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-[38px] md:text-[52px] font-medium text-[#0D1F1E] leading-[1.04] tracking-[-0.02em] mb-4">
              {t('headline1')}{' '}
              {t('headline2')}{' '}
              <span className="text-[#19706A]">{t('headline3')}</span>
              {' '}
              <span className="text-[#F2C94C] text-[28px] align-middle">✦</span>
            </h1>

            {/* Subline */}
            <p className="text-[15px] text-[#6B8886] leading-relaxed max-w-[320px] mb-8">
              {t('sub')}
            </p>

            {/* Service tabs */}
            <div className="flex gap-2 mb-7">
              <button
                onClick={() => setActiveTab('HOUSE')}
                className={`flex items-center gap-2 rounded-full border-[1.5px] px-[18px] py-[9px] text-[13px] font-medium transition-colors ${
                  activeTab === 'HOUSE'
                    ? 'bg-[#19706A] text-white border-[#19706A]'
                    : 'bg-white text-[#6B8886] border-[#E0EDEC]'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {t('tabHouse')}
              </button>

              <button
                onClick={() => setActiveTab('APARTMENT')}
                className={`flex items-center gap-2 rounded-full border-[1.5px] px-[18px] py-[9px] text-[13px] font-medium transition-colors ${
                  activeTab === 'APARTMENT'
                    ? 'bg-[#19706A] text-white border-[#19706A]'
                    : 'bg-white text-[#6B8886] border-[#E0EDEC]'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
                {t('tabApartment')}
              </button>
            </div>

            {/* CTAs */}
            <div className="flex gap-3 items-center">
              <button
                onClick={() => router.push(`/cleaners?service=${activeTab}`)}
                className="bg-[#19706A] text-white rounded-full px-7 py-[13px] text-[14px] font-medium hover:bg-[#0F6E56] transition-colors"
              >
                {t('findBtn')} →
              </button>

              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2.5 border-[1.5px] border-[#E0EDEC] rounded-full px-[22px] py-3 text-[14px] text-[#0D1F1E] hover:border-[#19706A] transition-colors"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#19706A] shrink-0">
                  <svg width="8" height="9" viewBox="0 0 8 9" fill="white">
                    <path d="M1 1.5L7 4.5L1 7.5V1.5Z" />
                  </svg>
                </span>
                {t('howItWorks')}
              </a>
            </div>
          </div>
        </div>

        {/* Right image column — desktop only */}
        <div className="hidden md:block relative">
          <div
            className="absolute"
            style={{
              top: '-72px',
              right: 0,
              bottom: '-80px',
              left: 0,
              clipPath: 'ellipse(88% 96% at 80% 50%)',
            }}
          >
            <Image
              src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"
              alt={t('altPhoto')}
              fill
              style={{ objectFit: 'cover', objectPosition: 'center top' }}
              priority
            />
          </div>

          {/* Floating trust card */}
          <div
            className="float-card absolute z-10 bg-white border border-[#E0EDEC] rounded-[16px] select-none"
            style={{
              bottom: '80px',
              left: '-20px',
              padding: '14px 18px',
              minWidth: '188px',
              boxShadow: '0 8px 32px rgba(25,112,106,0.13)',
            }}
          >
            {/* Avatar stack */}
            <div className="flex items-center mb-2">
              {[
                { label: 'A', bg: '#E8F4F3', color: '#19706A' },
                { label: 'M', bg: '#FDF8E1', color: '#BA7517' },
                { label: 'K', bg: '#E6F1FF', color: '#185FA5' },
                { label: '+1k', bg: '#19706A', color: '#fff', small: true },
              ].map((av, i) => (
                <span
                  key={av.label}
                  className="flex items-center justify-center rounded-full font-medium"
                  style={{
                    width: 27,
                    height: 27,
                    fontSize: av.small ? 8 : 11,
                    background: av.bg,
                    color: av.color,
                    border: '2.5px solid white',
                    marginLeft: i === 0 ? 0 : -8,
                    zIndex: 4 - i,
                    position: 'relative',
                  }}
                >
                  {av.label}
                </span>
              ))}
            </div>

            {/* Stars + rating */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[#F2C94C] text-[13px] leading-none tracking-tight">★★★★★</span>
              <span className="text-[13px] font-medium text-[#0D1F1E]">4.9/5</span>
            </div>

            <p className="text-[11px] text-[#6B8886] leading-snug">{t('ratingLabel')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
