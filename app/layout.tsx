import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // <--- İŞTE BU SATIR EKSİK OLDUĞU İÇİN ÇALIŞMIYOR!

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Last Penguin",
  description: "Digital echoes...",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}