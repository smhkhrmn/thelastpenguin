import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from '@next/third-parties/google'; // <--- Analytics Kütüphanesi

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "The Last Penguin | Digital Echoes in the Void",
    template: "%s | The Last Penguin"
  },
  description: "In a world where everyone follows the herd, standing alone on your own iceberg isn't madness, it's freedom. A digital sanctuary.",
  keywords: ["the last penguin", "digital diary", "void", "minimalist", "blog", "technology", "software"],
  authors: [{ name: "Captain", url: "https://thelastpenguin.com" }],
  openGraph: {
    title: "The Last Penguin",
    description: "A signal from the digital void. Waiting for transmission...",
    url: "https://thelastpenguin.com",
    siteName: "The Last Penguin",
    images: [
      {
        url: "/og-image.jpg", 
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        {/* Google Analytics Kodun Buraya Eklendi 👇 */}
        <GoogleAnalytics gaId="G-SQYS84GC72" />
      </body>
    </html>
  );
}