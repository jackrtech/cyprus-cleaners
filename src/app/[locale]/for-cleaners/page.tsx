'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'

type StepTitleKey = 'step1Title' | 'step2Title' | 'step3Title'
type StepBodyKey  = 'step1Body'  | 'step2Body'  | 'step3Body'
type TrustKey     = 'heroTrust1' | 'heroTrust2' | 'heroTrust3'

const STEPS: { num: string; title: StepTitleKey; body: StepBodyKey }[] = [
  { num: '01', title: 'step1Title', body: 'step1Body' },
  { num: '02', title: 'step2Title', body: 'step2Body' },
  { num: '03', title: 'step3Title', body: 'step3Body' },
]

const TRUST_KEYS: TrustKey[] = ['heroTrust1', 'heroTrust2', 'heroTrust3']

const ARC_RADII = [110, 190, 270, 350, 430]


const LOGO_SVG = (
  <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#E8F4F3" />
    <path d="M22 10.5C22 10.5 19.5 8 16 8C11.582 8 8 11.582 8 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="8" cy="16" r="1.5" fill="#F2C94C"/>
    <path d="M10 21.5C10 21.5 12.5 24 16 24C20.418 24 24 20.418 24 16" stroke="#19706A" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="24" cy="16" r="1.5" fill="#F2C94C"/>
  </svg>
)

const CHECKMARK = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="6.5" stroke="#19706A" strokeOpacity="0.3"/>
    <path d="M4.5 7l1.8 1.8 3.2-3.6" stroke="#19706A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function ForCleanersPage() {
  const t = useTranslations('forCleaners')

  // Hide global navbar — this page has its own landing nav
  useEffect(() => {
    document.documentElement.classList.add('fc-landing')
    return () => document.documentElement.classList.remove('fc-landing')
  }, [])

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: '#0D1F1E' }}>
      <style>{`
        html.fc-landing header.sticky { display: none !important; }

        /* Static fallback: underline is visible for reduced-motion / no-JS */
        .fc-underline { stroke-dashoffset: 0; }

        /* Truth items — subtle left gold accent, border between items */
        .fc-truth {
          border-left: 2px solid rgba(242,201,76,0.25);
          padding-left: 14px;
        }
        .fc-truth + .fc-truth {
          border-top: 1px solid rgba(255,255,255,0.12);
          padding-top: clamp(18px,2.5vw,28px);
        }

        /* Closing CTA button hover */
        .fc-cta-btn { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .fc-cta-btn:hover { transform: scale(1.04) translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.15); }
        .fc-cta-btn:active { transform: scale(0.98) translateY(0); }

        @media (prefers-reduced-motion: no-preference) {
          @keyframes fc-bob {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-8px); }
          }
          @keyframes fc-draw {
            from { stroke-dashoffset: 140; }
            to   { stroke-dashoffset: 0; }
          }
          .fc-bob          { animation: fc-bob 3.2s ease-in-out infinite; }
          .fc-bob-offset   { animation: fc-bob 3.2s ease-in-out infinite 1.6s; }
          .fc-underline    { animation: fc-draw 0.9s cubic-bezier(0.4, 0, 0.2, 1) 0.4s both; }
        }

        @media (max-width: 800px) {
          .fc-grid-2       { grid-template-columns: 1fr !important; }
          .fc-flex-close   { flex-direction: column !important; align-items: flex-start !important; }
          .fc-hide-mobile  { display: none !important; }
          .fc-arch-png     { height: 260px !important; }
          .fc-arch-section { clip-path: inset(0 round 120px 120px 0 0) !important; }
        }
      `}</style>

      {/* ── LANDING NAV ──────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'white',
          borderBottom: '1px solid #E0EDEC',
        }}
      >
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '0 clamp(20px,4vw,48px)',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
          }}
        >
          <Link
            href="/"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, textDecoration: 'none' }}
          >
            {LOGO_SVG}
            <span style={{ fontSize: '16px', fontWeight: 500, color: '#19706A', letterSpacing: '-0.01em' }}>
              Cyprus Cleaners
            </span>
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <Link href="/cleaners" style={{ fontSize: '14px', color: '#6B8886', textDecoration: 'none' }}>
              {t('navCustomers')}
            </Link>
            <Link href="/for-cleaners" style={{ fontSize: '14px', color: '#19706A', fontWeight: 500, textDecoration: 'none' }}>
              {t('navCleaners')}
            </Link>
          </nav>

          <Link
            href="/register/cleaner"
            className="btn-primary"
            style={{ fontSize: '14px', padding: '10px 22px', flexShrink: 0 }}
          >
            {t('heroCta')}
          </Link>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="Hero"
        style={{
          background: '#F7FAF9',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <clipPath id="fc-hero-clip" clipPathUnits="objectBoundingBox">
              <path d="M 0.26,0 L 1,0 L 1,1 L 0.26,1 C 0.04,0.88, 0.04,0.62, 0.26,0.5 C 0.48,0.38, 0.48,0.12, 0.26,0 Z" />
            </clipPath>
          </defs>
        </svg>
        <div
          className="fc-grid-2"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            minHeight: '560px',
          }}
        >
          {/* Left: text */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(64px,8vh,100px) clamp(24px,5vw,56px)' }}>
          <div style={{ maxWidth: '480px' }}>
            {/* Eyebrow pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#E8F4F3',
                borderRadius: '9999px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 500,
                color: '#19706A',
                marginBottom: 'clamp(20px,3vw,32px)',
              }}
            >
              <span aria-hidden="true" style={{ color: '#F2C94C' }}>✦</span>
              {t('heroEyebrow')}
            </div>

            {/* Headline — 3 lines, teal word with animated gold underline */}
            <h1
              style={{
                fontSize: 'clamp(32px,4vw,40px)',
                fontWeight: 500,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: '#0D1F1E',
                marginBottom: 'clamp(20px,3vw,32px)',
              }}
            >
              <span style={{ display: 'block' }}>{t('heroH1Line1')}</span>
              <span style={{ display: 'block' }}>{t('heroH1Line2')}</span>
              <span style={{ position: 'relative', display: 'inline-block', color: '#19706A' }}>
                {t('heroH1TealWord')}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 12"
                  preserveAspectRatio="none"
                  style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: 0,
                    width: '100%',
                    height: '10px',
                    overflow: 'visible',
                  }}
                >
                  <path
                    d="M1 9 Q26 5 50 9 Q74 13 99 9"
                    fill="none"
                    stroke="#F2C94C"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeDasharray="140"
                    className="fc-underline"
                  />
                </svg>
              </span>
            </h1>

            {/* Subtext */}
            <p
              style={{
                fontSize: 'clamp(15px,1.5vw,17px)',
                color: '#6B8886',
                lineHeight: 1.65,
                maxWidth: '460px',
                marginBottom: 'clamp(28px,4vw,40px)',
              }}
            >
              {t('heroSub')}
            </p>

            {/* CTA */}
            <div style={{ marginBottom: 'clamp(28px,4vw,40px)' }}>
              <Link href="/register/cleaner" className="btn-primary" style={{ fontSize: '15px', padding: '14px 32px' }}>
                {t('heroCta')}
              </Link>
            </div>

            {/* Trust row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              {TRUST_KEYS.map((key) => (
                <span
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#6B8886',
                    fontWeight: 500,
                  }}
                >
                  {CHECKMARK}
                  {t(key)}
                </span>
              ))}
            </div>
          </div>
          </div>

          {/* Right: photo + floating elements — hidden on mobile */}
          <div
            className="fc-hide-mobile"
            style={{ position: 'relative' }}
          >
            {/* Concentric arc backgrounds */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg viewBox="0 0 500 500" style={{ position: 'absolute', width: '180%', height: '180%' }}>
                {ARC_RADII.map((r, i) => (
                  <circle
                    key={r}
                    cx="250"
                    cy="250"
                    r={r}
                    fill="none"
                    stroke="#19706A"
                    strokeOpacity={0.05 - i * 0.005}
                    strokeWidth="1"
                  />
                ))}
              </svg>
            </div>

            {/* Photo — S-curve clip, bleeds to viewport edge */}
            <div style={{ position: 'absolute', top: '-72px', right: 0, bottom: '-80px', left: 0, clipPath: 'url(#fc-hero-clip)' }}>
              <Image
                src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=700&h=900&q=80&auto=format&fit=crop"
                alt="Professional cleaner in a bright home"
                fill
                priority
                sizes="50vw"
                style={{ objectFit: 'cover', objectPosition: 'center top' }}
              />
            </div>

            {/* Floating stat card — bottom left, bobs */}
            <div
              className="fc-bob"
              style={{
                position: 'absolute',
                bottom: 'clamp(24px,4vw,40px)',
                left: '-28px',
                background: 'white',
                borderRadius: '16px',
                padding: '16px 22px',
                boxShadow: '0 8px 32px rgba(13,31,30,0.12)',
                zIndex: 10,
                minWidth: '160px',
              }}
            >
              <p style={{ fontSize: 'clamp(22px,2.5vw,30px)', fontWeight: 500, color: '#0D1F1E', lineHeight: 1, marginBottom: '4px' }}>
                {t('heroStatNum')}
              </p>
              <p style={{ fontSize: '12px', color: '#6B8886', fontWeight: 500 }}>
                {t('heroStatLabel')}
              </p>
            </div>

            {/* Verified badge — top right, bobs offset */}
            <div
              className="fc-bob-offset"
              style={{
                position: 'absolute',
                top: 'clamp(24px,4vw,40px)',
                right: '-16px',
                background: 'white',
                borderRadius: '9999px',
                padding: '8px 16px',
                boxShadow: '0 4px 20px rgba(13,31,30,0.10)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                zIndex: 10,
                fontSize: '13px',
                fontWeight: 500,
                color: '#0D1F1E',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: '#19706A', fontWeight: 700 }}>✓</span>
              {t('heroBadgeVerified')}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section
        aria-label="How it works"
        style={{
          background: '#FFFFFF',
          padding: 'clamp(80px,10vh,120px) clamp(24px,5vw,72px)',
        }}
      >
        <div
          className="fc-grid-2"
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(48px,6vw,96px)',
            alignItems: 'start',
          }}
        >
          {/* Left: label + h2 + sub + photo */}
          <div>
            <p
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B8886',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '16px',
              }}
            >
              {t('howItWorksLabel')}
            </p>
            <h2
              style={{
                fontSize: 'clamp(26px,3.2vw,42px)',
                fontWeight: 500,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: '#0D1F1E',
                marginBottom: '14px',
              }}
            >
              {t('howH2Line1')}{' '}
              <span style={{ color: '#19706A' }}>{t('howH2Teal')}</span>
            </h2>
            <p
              style={{
                fontSize: 'clamp(14px,1.4vw,16px)',
                color: '#6B8886',
                lineHeight: 1.65,
                marginBottom: 'clamp(28px,4vw,44px)',
              }}
            >
              {t('howSub')}
            </p>

            {/* Photo with pill — hidden on mobile */}
            <div
              className="fc-hide-mobile"
              style={{
                position: 'relative',
                borderRadius: '16px',
                overflow: 'hidden',
                height: 'clamp(260px,32vw,400px)',
              }}
            >
              <Image
                src="https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?w=640&h=500&q=80&auto=format&fit=crop"
                alt="Cleaner working in a bright apartment"
                fill
                sizes="45vw"
                style={{ objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '20px',
                  left: '20px',
                  background: 'rgba(255,255,255,0.95)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  borderRadius: '9999px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#0D1F1E',
                }}
              >
                {t('howPhotoPill')}
              </div>
            </div>
          </div>

          {/* Right: 3 steps with border-bottom separators */}
          <div style={{ paddingTop: '4px' }}>
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                style={{
                  padding: 'clamp(24px,3.5vw,40px) 0',
                  borderBottom: i < STEPS.length - 1 ? '1px solid #E0EDEC' : 'none',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6B8886',
                    letterSpacing: '0.06em',
                    marginBottom: '10px',
                  }}
                >
                  {step.num}
                </span>
                <p
                  style={{
                    fontSize: 'clamp(17px,1.8vw,21px)',
                    fontWeight: 500,
                    color: '#0D1F1E',
                    lineHeight: 1.25,
                    letterSpacing: '-0.01em',
                    marginBottom: '8px',
                  }}
                >
                  {t(step.title)}
                </p>
                <p style={{ fontSize: 'clamp(14px,1.3vw,15px)', color: '#6B8886', lineHeight: 1.65 }}>
                  {t(step.body)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ARCH SECTION — SIGNATURE ─────────────────────────────── */}
      {/* White wrapper so clipped arch top matches the white section above */}
      <div style={{ background: '#FFFFFF' }}>
      <section
        aria-label="What's different"
        className="fc-arch-section"
        style={{
          background: '#0D1F1E',
          clipPath: 'ellipse(56% 100% at 50% 100%)',
          padding: 'clamp(140px,18vh,200px) clamp(24px,5vw,72px) clamp(80px,10vh,120px)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          className="fc-grid-2"
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(48px,6vw,80px)',
            alignItems: 'center',
          }}
        >
          {/* Left: free-standing cleaner PNG — transparent bg, grounded at bottom */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              alignSelf: 'stretch',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://claude.ai/api/7a604da2-8b09-4a8d-a796-e415790c1af4/files/73bd6302-597d-450d-8804-bd433cc1c859/preview"
              alt=""
              className="fc-arch-png"
              style={{
                display: 'block',
                height: 'clamp(300px,42vw,480px)',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                objectPosition: 'bottom center',
              }}
            />
          </div>

          {/* Right: label + h2 + truths */}
          <div>
            <p
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#19706A',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '20px',
              }}
            >
              {t('truthsLabel')}
            </p>
            <h2
              style={{
                fontSize: 'clamp(26px,3.2vw,42px)',
                fontWeight: 500,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: 'white',
                marginBottom: 'clamp(32px,4.5vw,52px)',
              }}
            >
              {t('archH2Line1')}{' '}
              <span style={{ color: '#F2C94C' }}>{t('archH2Gold')}</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p className="fc-truth" style={{ fontSize: 'clamp(15px,1.6vw,18px)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, letterSpacing: '-0.01em' }}>
                {t('archTruth1Pre')}{' '}
                <strong style={{ color: '#F2C94C', fontWeight: 500 }}>{t('archTruth1Bold')}</strong>
                {' '}{t('archTruth1Post')}
              </p>
              <p className="fc-truth" style={{ fontSize: 'clamp(15px,1.6vw,18px)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, letterSpacing: '-0.01em' }}>
                {t('archTruth2')}
              </p>
              <p className="fc-truth" style={{ fontSize: 'clamp(15px,1.6vw,18px)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, letterSpacing: '-0.01em' }}>
                {t('archTruth3')}
              </p>
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* ── QUOTE + PROFILE CARD ─────────────────────────────────── */}
      <section
        aria-label="Testimonial"
        style={{
          background: '#F7FAF9',
          padding: 'clamp(80px,10vh,120px) clamp(24px,5vw,72px)',
        }}
      >
        <div
          className="fc-grid-2"
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 'clamp(48px,6vw,96px)',
            alignItems: 'center',
          }}
        >
          {/* Left: pull quote */}
          <div style={{ maxWidth: '540px' }}>
            <p
              aria-hidden="true"
              style={{
                fontSize: '88px',
                lineHeight: 0.72,
                color: '#E0EDEC',
                fontWeight: 500,
                marginBottom: '8px',
                letterSpacing: '-0.04em',
                userSelect: 'none',
              }}
            >
              "
            </p>
            <blockquote style={{ margin: 0 }}>
              <p
                style={{
                  fontSize: 'clamp(20px,2.4vw,28px)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  color: '#19706A',
                  lineHeight: 1.45,
                  letterSpacing: '-0.01em',
                  marginBottom: '24px',
                }}
              >
                {t('quote')}
              </p>
              <footer>
                <cite style={{ fontSize: '14px', fontStyle: 'normal', fontWeight: 500, color: '#6B8886' }}>
                  {t('quoteAttr')}
                </cite>
              </footer>
            </blockquote>
          </div>

          {/* Right: testimonial card with photo */}
          <div style={{ width: '240px', flexShrink: 0, background: 'white', borderRadius: '16px', border: '1px solid #E0EDEC', overflow: 'hidden', boxShadow: '0 4px 20px rgba(13,31,30,0.06)' }}>
            <div style={{ position: 'relative', height: '220px' }}>
              <Image
                src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=300&h=280&q=80&auto=format&fit=crop&crop=face"
                alt="Elena K."
                fill
                sizes="240px"
                style={{ objectFit: 'cover', objectPosition: 'center top' }}
              />
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500, fontSize: '15px', color: '#0D1F1E' }}>Elena K.</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#E8F4F3', borderRadius: '9999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#19706A' }}>
                  ✓ Verified
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#6B8886', marginBottom: '10px' }}>Limassol · €18/hr</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ color: '#F2C94C', fontSize: '12px', letterSpacing: '-0.5px' }}>★★★★★</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#0D1F1E' }}>4.9</span>
                <span style={{ fontSize: '12px', color: '#6B8886' }}>(38 reviews)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ──────────────────────────────────────────── */}
      <section
        aria-label="Call to action"
        style={{
          background: '#19706A',
          padding: 'clamp(80px,10vh,120px) clamp(24px,5vw,72px)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Concentric arcs — decorative right side */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '-80px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <svg width="520" height="520" viewBox="0 0 520 520">
            {[60, 120, 180, 240, 300, 360].map((r) => (
              <circle
                key={r}
                cx="520"
                cy="260"
                r={r}
                fill="none"
                stroke="white"
                strokeOpacity="0.07"
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>

        <div
          className="fc-flex-close"
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'clamp(32px,5vw,64px)',
            position: 'relative',
          }}
        >
          {/* Text */}
          <div>
            <h2
              style={{
                fontSize: 'clamp(24px,3.2vw,44px)',
                fontWeight: 500,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: 'white',
                marginBottom: '12px',
              }}
            >
              <span style={{ display: 'block' }}>{t('closingH2Line1')}</span>
              <span style={{ display: 'block' }}>{t('closingH2Line2')}</span>
            </h2>
            <p style={{ fontSize: 'clamp(13px,1.3vw,15px)', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              {t('closingSub')}
            </p>
          </div>

          {/* White button */}
          <Link
            href="/register/cleaner"
            className="fc-cta-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '16px 36px',
              background: 'white',
              color: '#19706A',
              borderRadius: '9999px',
              fontSize: '15px',
              fontWeight: 500,
              textDecoration: 'none',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}
          >
            {t('heroCta')} →
          </Link>
        </div>
      </section>
    </div>
  )
}
