/** @type {import('next').NextConfig} */
const withNextIntl = require('next-intl/plugin')('./src/lib/i18n.ts')

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs'],
  },
}

module.exports = withNextIntl(nextConfig)
