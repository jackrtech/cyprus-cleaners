/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // --- Primary: Teal ---
        teal: {
          50:  '#E8F4F3',
          100: '#C5E4E2',
          200: '#9DCFCC',
          300: '#6BB5B1',
          400: '#3D9E99',
          500: '#19706A', // PRIMARY — CTAs, nav, key UI
          600: '#145C57',
          700: '#0F4844',
          800: '#0A3532',
          900: '#0D1F1E', // Near-black — headings, body text
        },
        // --- Accent: Gold ---
        gold: {
          50:  '#FDF8E1',
          100: '#FAF0B8',
          200: '#F7E48A',
          300: '#F5D85C',
          400: '#F2C94C', // ACCENT — stars, highlights, spark
          500: '#D4A92A',
          600: '#A87E1A',
          700: '#7A5F00',
          800: '#5A4500',
          900: '#3A2C00',
        },
        // --- Info: Blue ---
        blue: {
          50:  '#E6F1FF',
          100: '#BDDAFF',
          200: '#90C0FF',
          300: '#5FA3FF',
          400: '#2D8CFF', // INFO — chat, links, info states
          500: '#1A72E8',
          600: '#1059C0',
          700: '#0A4FA6',
          800: '#063A7A',
          900: '#042C53',
        },
        // --- Neutrals ---
        muted: '#6B8886',    // Secondary text, icons
        surface: '#F7FAF9',  // Page background (off-white with teal tint)
        border: '#E0EDEC',   // Default border
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Type scale from design system
        'hero':  ['3.5rem',  { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '500' }],
        'h1':    ['2.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '500' }],
        'h2':    ['2rem',    { lineHeight: '1.2',  letterSpacing: '-0.01em', fontWeight: '500' }],
        'h3':    ['1.375rem',{ lineHeight: '1.3',  fontWeight: '500' }],
        'h4':    ['1.125rem',{ lineHeight: '1.4',  fontWeight: '500' }],
        'body':  ['0.9375rem',{ lineHeight: '1.6', fontWeight: '400' }],
        'sm':    ['0.8125rem',{ lineHeight: '1.5', fontWeight: '400' }],
        'label': ['0.6875rem',{ lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.07em' }],
      },
      borderRadius: {
        'sm':   '6px',
        'md':   '10px',
        'lg':   '16px',
        'xl':   '24px',
        'full': '9999px',
      },
      spacing: {
        // Custom spacing tokens on top of Tailwind defaults
        '4.5': '1.125rem',
        '13':  '3.25rem',
        '15':  '3.75rem',
        '18':  '4.5rem',
        '22':  '5.5rem',
      },
      boxShadow: {
        // Teal-tinted shadows — not generic greys
        'card':   '0 1px 3px rgba(25, 112, 106, 0.08), 0 4px 12px rgba(25, 112, 106, 0.06)',
        'card-hover': '0 4px 16px rgba(25, 112, 106, 0.14), 0 1px 4px rgba(25, 112, 106, 0.08)',
        'focus':  '0 0 0 3px rgba(25, 112, 106, 0.25)',
        'modal':  '0 20px 60px rgba(13, 31, 30, 0.2)',
      },
      keyframes: {
        // CS kinetic animations
        'cs-trace': {
          '0%':   { strokeDashoffset: '200' },
          '100%': { strokeDashoffset: '0' },
        },
        'cs-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%':       { opacity: '0.8', transform: 'scale(1.02)' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'star-pop': {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.4)' },
          '100%': { transform: 'scale(1.1)' },
        },
      },
      animation: {
        'cs-trace':  'cs-trace 1.4s ease-out forwards',
        'cs-pulse':  'cs-pulse 3s ease-in-out infinite',
        'fade-up':   'fade-up 0.4s ease-out forwards',
        'fade-in':   'fade-in 0.3s ease-out forwards',
        'star-pop':  'star-pop 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
