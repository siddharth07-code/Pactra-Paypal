"use client";
import Link from "next/link";
import Image from "next/image";
import { OrganizationMembers } from "@/components/OrganizationMembers";
import { OrganizationBoundary, type ActiveOrganization } from "@/components/OrganizationBoundary";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export default function AccountPage() {
  return <OrganizationBoundary renderAccount={(selection, active) => <AccountContent selection={selection} active={active} />} />;
}

function AccountContent({ selection, active }: { selection: ReactNode; active: ActiveOrganization | null }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Motion refs for coordinated entrance
  const containerRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (response.ok) setEmail(data.principal.email);
        else setError(data.error?.message ?? "Sign in to continue.");
      }).catch(() => { if (!controller.signal.aborted) setError("Authentication is unavailable. Please retry."); });
    return () => controller.abort();
  }, []);

  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) { setError("Logout could not be confirmed. Please retry."); return; }
      window.location.assign("/login");
    } catch { setError("Logout is unavailable. Please retry."); }
    finally { setBusy(false); }
  }

  // Coordinated entrance choreography
  useGSAP(
    () => {
      const prefersReduced =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches);
      if (prefersReduced) return;

      const delay =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("view-transition-active")
          ? 0.08
          : 0.02;

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        delay,
      });

      if (cardRef.current) {
        tl.fromTo(
          cardRef.current,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.48,
            ease: "power3.out",
            clearProps: "transform,opacity",
          },
          0
        );
      }

      if (brandRef.current) {
        tl.fromTo(
          brandRef.current,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            ease: "power2.out",
            clearProps: "transform,opacity",
          },
          0.06
        );
      }

      if (headingRef.current) {
        tl.fromTo(
          headingRef.current,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.42,
            ease: "power3.out",
            clearProps: "transform,opacity",
          },
          0.1
        );
      }

      if (statusRef.current) {
        tl.fromTo(
          statusRef.current,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            ease: "power2.out",
            clearProps: "transform,opacity",
          },
          0.16
        );
      }

      if (noticeRef.current) {
        tl.fromTo(
          noticeRef.current,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.38,
            ease: "power2.out",
            clearProps: "transform,opacity",
          },
          0.22
        );
      }

      if (membersRef.current) {
        tl.fromTo(
          membersRef.current,
          { opacity: 0, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: "power2.out",
            clearProps: "transform,opacity",
          },
          0.26
        );
      }

      if (footerRef.current) {
        tl.fromTo(
          footerRef.current,
          { opacity: 0, y: 6 },
          {
            opacity: 1,
            y: 0,
            duration: 0.32,
            ease: "power2.out",
            clearProps: "transform,opacity",
          },
          0.3
        );
      }
    },
    { scope: containerRef }
  );

  // Animate error message if it appears
  useEffect(() => {
    if (!error || !errorRef.current) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches);
    if (prefersReduced) return;

    gsap.fromTo(
      errorRef.current,
      { opacity: 0, y: -4 },
      { opacity: 1, y: 0, duration: 0.28, ease: "power2.out", clearProps: "transform,opacity" }
    );
  }, [error]);

  return (
    <main ref={containerRef} className="pactum-workspace min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-4 sm:p-6">
      <section ref={cardRef} className="max-w-xl w-full space-y-6 rounded-[6px] border border-border-primary bg-surface-primary p-6 sm:p-8">
        <div ref={brandRef} className="flex items-center justify-between gap-4 border-b border-border-primary pb-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-[5px] flex items-center justify-center shrink-0 select-none overflow-hidden">
              <Image src="/brand/pactra-mark.png" alt="" width={28} height={28} className="w-7 h-7 object-contain" priority />
            </span>
            <span className="text-[16px] tracking-[-0.02em] font-semibold text-text-primary">
              PACTRA
            </span>
          </div>
          <Link
            href="/workspace"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-[6px] border border-border-primary bg-surface-secondary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Workspace</span>
          </Link>
        </div>

        <div className="space-y-1.5">
          <div className="overflow-hidden pb-1 -mb-1">
            <h1
              ref={headingRef}
              className="workspace-title text-text-primary translate-y-0 opacity-100 will-change-transform"
            >
              Account &amp; Workspace
            </h1>
          </div>
          <p ref={statusRef} className="text-sm text-text-secondary">
            {email ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Signed in as {email}
              </span>
            ) : (
              "Checking your verified session…"
            )}
          </p>
        </div>

        <div ref={noticeRef} className="rounded-[6px] border border-border-primary bg-surface-secondary p-4 text-xs text-text-secondary leading-relaxed">
          Select an organization to access procurement and settlement. Your active membership and permissions are verified by the server for every operation.
        </div>

        {selection}

        {active?.permissions.includes("membership.manage") && <div ref={membersRef}>
          <OrganizationMembers key={active.id} />
        </div>}

        {error && (
          <div ref={errorRef} role="alert" className="p-3 rounded-[6px] border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        <div ref={footerRef} className="pt-2 border-t border-border-primary flex items-center justify-between">
          <button
            type="button"
            disabled={busy}
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-surface-secondary hover:bg-surface-secondary/80 text-text-primary border border-border-primary text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{busy ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
