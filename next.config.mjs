/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Always fetch fresh data when navigating between pages. Without this the
  // browser's client-side router cache re-shows a page visited in the last
  // 30 seconds, so a newly saved quote/job wouldn't appear until a refresh.
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
