import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACTUM | Autonomous B2B Procurement & Cryptographic Settlement"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-[#0070e0]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
