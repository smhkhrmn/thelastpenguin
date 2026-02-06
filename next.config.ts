/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript hatalarını görmezden gel (Build sırasında)
  typescript: {
    ignoreBuildErrors: true,
  },
  // ESLint hatalarını görmezden gel (Build sırasında)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Hostinger veya dış kaynaklı resimler için
  images: {
    unoptimized: true, 
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;