import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // modul native/berat dijalankan langsung oleh Node, tidak di-bundle
  serverExternalPackages: ['playwright-core', 'pg'],
  poweredByHeader: false,
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
