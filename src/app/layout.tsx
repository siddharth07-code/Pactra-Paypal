import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || "https://pactra.example"),
  title: "PACTRA | Autonomous B2B Procurement & Cryptographic Settlement",
  description: "Negotiate Intelligently. Settle Verifiably.",
  openGraph: {
    title: "PACTRA | Autonomous B2B Procurement & Cryptographic Settlement",
    description: "Negotiate Intelligently. Settle Verifiably.",
    images: [{ url: "/brand/pactra-social-preview.png", width: 1200, height: 630, alt: "PACTRA" }],
  },
  icons: {
    icon: "/brand/pactra-mark.png",
    apple: "/brand/pactra-mark.png",
  },
};

import { ThemeProvider } from "@/lib/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function() {
  try {
    var stored = localStorage.getItem('pactra_theme') || localStorage.getItem('pactum_theme');
    var isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch(e) {}
})();`,
          }}
        />
      </head>
      <body className="antialiased selection:bg-[#ff6600]/20 selection:text-[#ff6600] bg-page-bg text-text-primary transition-colors duration-150">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
