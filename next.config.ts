/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // TypeScript hatalarını görmezden gel (Build sırasında)
    ignoreBuildErrors: true,
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