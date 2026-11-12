import Image from "next/image";
import Link from "next/link";

export function LandingHeader({ currentPage }: { currentPage: "home" | "about" }) {
  return (
    <header className="landing-container landing-header">
      <Link href="/" className="landing-brand" aria-current={currentPage === "home" ? "page" : undefined}>
        <span aria-hidden="true" className="landing-monogram">
          <Image src="/brand/pactra-mark.png" alt="" width={28} height={28} className="w-full h-full object-contain" priority />
        </span>
        PACTRA
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/about" className="landing-sign-in" aria-current={currentPage === "about" ? "page" : undefined}>About</Link>
        <Link href="/login" className="landing-sign-in">Sign in</Link>
        <Link href="/register" className="landing-register">Create account</Link>
      </nav>
    </header>
  );
}
