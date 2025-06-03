/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *;' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
  // Disable all security headers for embed routes
  async rewrites() {
    return [
      {
        source: '/embed/:path*',
        destination: '/embed/:path*',
      },
    ];
  },
  images: {
    domains: ['localhost'],
    formats: ['image/webp'],
  },
  env: {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  },
};

module.exports = nextConfig; 