import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // modul native/berat dijalankan langsung oleh Node, tidak di-bundle
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // HSTS hanya berlaku lewat HTTPS; browser mengabaikannya di http://localhost
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
      ],
    }];
  },
  // Tailwind CSS v4 lewat loader Turbopack (bawaan create-next-app 16)
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
