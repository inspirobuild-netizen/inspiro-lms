/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.b-cdn.net' },
      { protocol: 'https', hostname: '*.backblazeb2.com' },
    ],
  },
};

export default nextConfig;
