"use client";

import React, { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { PrimaryButton, GhostButton, CurrencyDisplay } from "./SharedUI";
import { PageContainer, OperationsPanel, DataMessage, LedgerTable } from "./OperationsUI";
import type { ProcurementSession } from "@/types/pactum";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

interface OverviewScreenProps {
  sessions: ProcurementSession[];
  onStartNew: () => void;
  onOpenSession: (session: ProcurementSession) => void;
  onNavigateHistory?: () => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

export const getSessionLifecycleConfig = (session: ProcurementSession) => {
  const states: Record<string, { label: string; nextAction: string; status: "neutral" | "warning" | "verified" | "failure" | "info" }> = {
    SETTLED: { label: "Settled", nextAction: "Review settlement records.", status: "verified" },
    PAYPAL_CAPTURED: { label: "Captured", nextAction: "Review capture evidence.", status: "verified" },
    PAYPAL_AUTHORIZED: { label: "Authorized", nextAction: "Review settlement before capture.", status: "info" },
    AWAITING_PAYPAL_APPROVAL: { label: "Awaiting approval", nextAction: "Complete buyer approval in PayPal Sandbox.", status: "warning" },
    CAPTURE_PENDING_RECONCILIATION: { label: "Reconciliation needed", nextAction: "Payment outcome is uncertain. Reconcile before any further payment action.", status: "warning" },
    AUDIT_PASSED: { label: "Audit passed", nextAction: "Review settlement eligibility.", status: "verified" },
    AUDIT_FAILED: { label: "Audit blocked", nextAction: "Review failed checks before proceeding.", status: "failure" },
    AUDIT_PENDING: { label: "Awaiting audit", nextAction: "Review agreed terms and run ACWORLD audit.", status: "warning" },
    NEGOTIATING: { label: "Negotiating", nextAction: "Review negotiation progress.", status: "info" },
    SOURCING: { label: "Sourcing", nextAction: "Review supplier offers.", status: "neutral" },
    MANDATE_PENDING: { label: "Mandate pending", nextAction: "Review requirements and supplier offers.", status: "neutral" },
    CANCELLED: { label: "Cancelled", nextAction: "This procurement is closed.", status: "neutral" },
    DISPUTED: { label: "Disputed", nextAction: "Review dispute evidence. PayPal submission is not confirmed.", status: "warning" },
  };
  return states[session.status] ?? { label: session.status.toLowerCase().replaceAll("_", " "), nextAction: "Review procurement details.", status: "neutral" as const };
};

const closed = new Set(["SETTLED", "PAYPAL_CAPTURED", "CANCELLED", "AUDIT_FAILED", "DISPUTED"]);
const needsReview = new Set(["AUDIT_PENDING", "AUDIT_FAILED", "PAYPAL_AUTHORIZED", "AWAITING_PAYPAL_APPROVAL", "CAPTURE_PENDING_RECONCILIATION", "DISPUTED"]);
function timestamp(session: ProcurementSession) {
  const value = Date.parse(session.updatedAt || session.createdAt);
  return Number.isFinite(value) ? value : 0;
}
function updatedLabel(session: ProcurementSession) {
  const value = timestamp(session);
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value) : "Date unavailable";
}

export function OverviewScreen({
  sessions,
  onStartNew,
  onOpenSession,
  onNavigateHistory,
  loading = false,
  error = "",
  onRetry,
}: OverviewScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const actionButtonRef = useRef<HTMLDivElement>(null);
  const kpiListRef = useRef<HTMLDListElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  const recent = [...sessions].sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 8);
  const outstanding = [...sessions].filter(s => needsReview.has(s.status)).sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 4);
  const activeCount = sessions.filter(s => !closed.has(s.status)).length;
  const reviewCount = sessions.filter(s => needsReview.has(s.status)).length;
  const settledCount = sessions.filter(s => s.status === "SETTLED" || (s.status === "PAYPAL_CAPTURED" && Boolean(s.paypalCaptureId))).length;

  // Track previous counts to trigger meaningful data transitions
  const prevDataRef = useRef({
    activeCount,
    reviewCount,
    settledCount,
    sessionsCount: sessions.length,
    initialRender: true,
  });

  useGSAP(
    () => {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) return;

      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        // Coordinate with the 520ms View Transition API.
        // A subtle offset synchronizes entrance with the view-transition container settling.
        const delay =
          typeof document !== "undefined" &&
          document.documentElement.classList.contains("view-transition-active")
            ? 0.08
            : 0.02;

        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          delay,
        });

        // Stage A: Heading Reveal through vertical clipping mask
        if (headingRef.current) {
          tl.fromTo(
            headingRef.current,
            { y: 28, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.58,
              ease: "power3.out",
              clearProps: "transform,opacity",
            },
            0
          );
        }

        // Stage B: Supporting information and action
        const stageBElements = [subtitleRef.current, actionButtonRef.current].filter(Boolean);
        if (stageBElements.length > 0) {
          tl.fromTo(
            stageBElements,
            { y: 14, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.45,
              stagger: 0.075,
              ease: "power2.out",
              clearProps: "transform,opacity",
            },
            0.12
          );
        }

        // Stage C: KPI Metrics reveal
        if (kpiListRef.current && kpiListRef.current.children.length > 0) {
          tl.fromTo(
            Array.from(kpiListRef.current.children),
            { y: 16, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.42,
              stagger: 0.075,
              ease: "power2.out",
              clearProps: "transform,opacity",
            },
            0.22
          );
        }

        // Stage D: Main Content Sections
        if (mainContentRef.current) {
          const sections = Array.from(
            mainContentRef.current.querySelectorAll<HTMLElement>(".overview-section")
          );

          sections.forEach((section, index) => {
            const rect = section.getBoundingClientRect();
            const isInInitialViewport =
              typeof window !== "undefined" ? rect.top < (window.innerHeight || 800) * 0.95 : true;

            if (isInInitialViewport && index === 0) {
              tl.fromTo(
                section,
                { y: 18, opacity: 0 },
                {
                  y: 0,
                  opacity: 1,
                  duration: 0.48,
                  ease: "power2.out",
                  clearProps: "transform,opacity",
                },
                0.32
              );
            } else {
              // Scroll-triggered reveal for lower sections
              ScrollTrigger.create({
                trigger: section,
                start: "top 92%",
                once: true,
                onEnter: () => {
                  gsap.fromTo(
                    section,
                    { y: 20, opacity: 0 },
                    {
                      y: 0,
                      opacity: 1,
                      duration: 0.52,
                      ease: "power2.out",
                      clearProps: "transform,opacity",
                    }
                  );
                },
              });
            }
          });
        }
      });
      return () => media.revert();
    },
    { scope: containerRef, dependencies: [loading, Boolean(error), sessions.length === 0] }
  );

  // Subtle data-update feedback when sessions change while mounted
  useEffect(() => {
    if (prevDataRef.current.initialRender) {
      prevDataRef.current.initialRender = false;
      return;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const prev = prevDataRef.current;
    if (kpiListRef.current) {
      if (prev.activeCount !== activeCount) {
        const activeCard = kpiListRef.current.querySelector<HTMLElement>('[data-kpi="active"]');
        if (activeCard) {
          gsap.fromTo(
            activeCard,
            { opacity: 0.6, y: -2 },
            { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform,opacity" }
          );
        }
      }
      if (prev.reviewCount !== reviewCount) {
        const reviewCard = kpiListRef.current.querySelector<HTMLElement>('[data-kpi="review"]');
        if (reviewCard) {
          gsap.fromTo(
            reviewCard,
            { opacity: 0.6, y: -2 },
            { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform,opacity" }
          );
        }
      }
      if (prev.settledCount !== settledCount) {
        const settledCard = kpiListRef.current.querySelector<HTMLElement>('[data-kpi="settled"]');
        if (settledCard) {
          gsap.fromTo(
            settledCard,
            { opacity: 0.6, y: -2 },
            { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform,opacity" }
          );
        }
      }
    }

    prevDataRef.current = {
      activeCount,
      reviewCount,
      settledCount,
      sessionsCount: sessions.length,
      initialRender: false,
    };
  }, [activeCount, reviewCount, settledCount, sessions.length]);

  return (
    <PageContainer>
      <div ref={containerRef} className="space-y-8">
        {/* Header with clipping mask for stage A & B */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="overflow-hidden pb-1 -mb-1">
              <h1
                ref={headingRef}
                className="workspace-title translate-y-0 opacity-100 will-change-transform"
              >
                Procurement overview
              </h1>
            </div>
            <p ref={subtitleRef} className="text-sm text-text-secondary translate-y-0 opacity-100">
              Your mandates, outstanding decisions and settlement progress.
            </p>
          </div>
          <div ref={actionButtonRef} className="translate-y-0 opacity-100">
            <PrimaryButton onClick={onStartNew}>New mandate</PrimaryButton>
          </div>
        </div>

        {/* Content & Panels */}
        <div ref={mainContentRef} className="space-y-8">
          {loading ? (
            <div className="overview-section">
              <OperationsPanel title="Mandates">
                <DataMessage title="Loading procurement records…" />
              </OperationsPanel>
            </div>
          ) : error ? (
            <div className="overview-section">
              <OperationsPanel title="Procurement unavailable">
                <DataMessage title="Could not load your mandates" error>
                  <p>{error}</p>
                  {onRetry && (
                    <GhostButton onClick={onRetry} className="mt-4">
                      Try again
                    </GhostButton>
                  )}
                </DataMessage>
              </OperationsPanel>
            </div>
          ) : sessions.length === 0 ? (
            <div className="overview-section">
              <OperationsPanel title="Your procurement workspace">
                <DataMessage title="No mandates yet">
                  <p>
                    Create a mandate to define what you need, compare supplier offers and track an agreement through settlement.
                  </p>
                  <p className="mt-2">Your procurement records will appear here.</p>
                </DataMessage>
              </OperationsPanel>
            </div>
          ) : (
            <>
              {/* Stage C: KPI Metrics */}
              <dl
                ref={kpiListRef}
                className="flex flex-wrap gap-x-12 gap-y-5 border-y border-border-primary py-5"
              >
                {[
                  ["Active mandates", activeCount, "active"],
                  ["Needs review", reviewCount, "review"],
                  ["Settled procurements", settledCount, "settled"],
                ].map(([label, value, key]) => (
                  <div
                    key={label}
                    data-kpi={key}
                    className="min-w-[140px] translate-y-0 opacity-100"
                  >
                    <dt className="text-sm text-text-secondary">{label}</dt>
                    <dd className="mt-1 text-3xl font-medium tabular-nums tracking-tight">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Outstanding Reviews */}
              {outstanding.length > 0 && (
                <div className="overview-section" data-section="outstanding">
                  <OperationsPanel title="Needs your review">
                    <ul className="divide-y divide-border-primary">
                      {outstanding.map((session) => (
                        <li
                          key={session.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 transition-colors duration-150 hover:bg-surface-secondary/40"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium break-words">{session.mandate.itemQuery}</p>
                            <p className="mt-1 text-sm text-text-secondary">
                              {getSessionLifecycleConfig(session).nextAction}
                            </p>
                          </div>
                          <GhostButton
                            onClick={() => onOpenSession(session)}
                            ariaLabel={`Review ${session.mandate.itemQuery}`}
                          >
                            Review mandate
                          </GhostButton>
                        </li>
                      ))}
                    </ul>
                  </OperationsPanel>
                </div>
              )}

              {/* Recently Updated Mandates */}
              <div className="overview-section" data-section="recent">
                <OperationsPanel
                  title="Recently updated mandates"
                  action={
                    onNavigateHistory && (
                      <GhostButton onClick={onNavigateHistory}>View history</GhostButton>
                    )
                  }
                >
                  <LedgerTable label="Recent procurement mandates">
                    <thead>
                      <tr>
                        <th scope="col">Mandate</th>
                        <th scope="col">State</th>
                        <th scope="col" className="text-right">Budget</th>
                        <th scope="col">Updated (UTC)</th>
                        <th scope="col">
                          <span className="sr-only">Open record</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((session) => (
                        <tr
                          key={session.id}
                          className="transition-colors duration-150 hover:bg-surface-secondary/30"
                        >
                          <th scope="row" className="font-medium">
                            <span className="block max-w-[360px] break-words">
                              {session.mandate.itemQuery}
                            </span>
                            <span className="mt-1 block text-xs font-normal text-text-secondary">
                              {session.mandate.quantity} units
                            </span>
                          </th>
                          <td>{getSessionLifecycleConfig(session).label}</td>
                          <td className="text-right whitespace-nowrap">
                            <CurrencyDisplay
                              amount={session.mandate.maxTotalBudget}
                              currency={session.mandate.currency || "USD"}
                            />
                            <span className="ml-2 text-xs text-text-secondary">
                              {session.mandate.currency || "USD"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-text-secondary">
                            {updatedLabel(session)}
                          </td>
                          <td className="text-right">
                            <GhostButton
                              onClick={() => onOpenSession(session)}
                              ariaLabel={`Open mandate ${session.id}`}
                            >
                              Open
                            </GhostButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </LedgerTable>
                  <p className="px-5 py-3 border-t border-border-primary text-xs text-text-secondary">
                    Budgets are commercial limits, not payment totals. Each amount retains its original currency.
                  </p>
                </OperationsPanel>
              </div>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
