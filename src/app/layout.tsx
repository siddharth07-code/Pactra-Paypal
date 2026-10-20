import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PACTUM | Autonomous B2B Procurement & Cryptographic Settlement",
  description: "Negotiate Intelligently. Settle Verifiably.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased selection:bg-[#ff6600]/20 selection:text-[#ff6600]">
        {children}
      </body>
    </html>
  );
}
