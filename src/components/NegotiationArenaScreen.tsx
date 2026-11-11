"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CheckCircle2, ShieldAlert, AlertTriangle } from "lucide-react";
import { PrimaryButton, GhostButton } from "./SharedUI";
import { OperationsPanel } from "./OperationsUI";
import type { VendorQuote, ProcurementMandate, ProcurementSession } from "@/types/pactum";
import { formatCurrency, toMinorUnits, fromMinorUnits } from "@/lib/currency";
import { negotiationFailureMessage } from "@/lib/negotiation-failure";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export interface StreamEventItem {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface NegotiationArenaScreenProps {
  sessionId?: string;
  mandate?: ProcurementMandate;
  quotes: VendorQuote[];
  events: StreamEventItem[];
  isStreaming: boolean;
  onProceedToSettlement?: () => void;
  onStartNegotiation?: () => Promise<void> | void;
  session?: ProcurementSession;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function NegotiationArenaScreen({
  sessionId,
  mandate,
  quotes,
  events,
  isStreaming,
  onProceedToSettlement,
  onStartNegotiation,
  session,
  loading = false,
  error,
  onRetry,
}: NegotiationArenaScreenProps) {
  const authoritativeMandate = session?.mandate ?? mandate;
  const currency = authoritativeMandate?.currency;
  const money = (value: unknown) =>
    currency && number(value) !== undefined ? formatCurrency(value as number, currency) : "Not recorded";
  const terminal = events
    .filter((event) => ["NEGOTIATION_COMPLETED", "NEGOTIATION_FAILED", "NEGOTIATION_ABORTED"].includes(event.type))
    .at(-1);
  const failed = terminal?.type === "NEGOTIATION_FAILED" || (!terminal && !isStreaming && Boolean(session?.negotiationFailure));
  const stopped = terminal?.type === "NEGOTIATION_ABORTED";
  const completed = terminal?.type === "NEGOTIATION_COMPLETED" ? terminal : undefined;
  const agreement = session?.agreementRecord;
  const hasDeal =
    !failed &&
    !stopped &&
    Boolean(
      agreement ||
        (completed &&
          completed.payload.outcome !== "NO_DEAL" &&
          (completed.payload.selectedVendor || completed.payload.winningVendor || completed.payload.winningVendorId))
    );
  const noDeal =
    !hasDeal && !failed && !stopped && Boolean(completed || (session?.status === "AUDIT_FAILED" && session.turns.length));
  const winnerId = agreement?.vendorId ?? completed?.payload.winningVendorId;
  const winner = agreement?.vendorName ?? completed?.payload.selectedVendor ?? completed?.payload.winningVendor;
  const agreedOffer = (agreement?.agreedOffer ?? completed?.payload.finalOffer) as
    | { unitPrice?: number; shippingCost?: number; deliveryDays?: number; returnDays?: number }
    | undefined;
  const total = agreement?.totalCost ?? completed?.payload.totalCost ?? completed?.payload.finalTotalCost ?? completed?.payload.finalAmount;
  const round = events.reduce((max, event) => Math.max(max, number(event.payload.round) ?? 0), 0);
  const maxRounds = events.find((event) => event.type === "ROUND_STARTED")?.payload.maxRounds;
  const state =
    session?.status === "CANCELLED"
      ? "Session cancelled"
      : isStreaming
      ? "Negotiation running"
      : failed
      ? "Negotiation Halted"
      : stopped
      ? "Negotiation stopped"
      : hasDeal
      ? "Agreement recorded"
      : noDeal
      ? "No deal reached"
      : session?.turns?.length
      ? "Saved negotiation"
      : authoritativeMandate
      ? "Not started"
      : "No session loaded";
  const failureReference = terminal?.payload.reference ?? session?.negotiationFailure?.reference;
  const fallback = events.some((event) => event.payload.generator === "DETERMINISTIC_FALLBACK");
  const canStart = Boolean(
    authoritativeMandate &&
      quotes.length &&
      onStartNegotiation &&
      !loading &&
      !error &&
      !terminal &&
      !session?.negotiationFailure &&
      (!session || ["MANDATE_PENDING", "SOURCING", "NEGOTIATING"].includes(session.status))
  );

  const [starting, setStarting] = useState(false);
  const startClaim = useRef(false);
  const [startError, setStartError] = useState(false);

  // Motion and DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const statusBadgeRef = useRef<HTMLParagraphElement>(null);
  const mandateSummaryRef = useRef<HTMLDListElement>(null);
  const agreementRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  const prevEventsCountRef = useRef<number>(events.length);
  const prevDealRef = useRef<boolean>(hasDeal);

  // Stage A-D Entrance Choreography
  useGSAP(
    () => {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) return;

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const delay =
          typeof document !== "undefined" &&
          document.documentElement.classList.contains("view-transition-active")
            ? 0.08
            : 0.02;

        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          delay,
        });

        // Stage A: Heading reveal through vertical clipping mask
        if (headingRef.current) {
          tl.fromTo(
            headingRef.current,
            { y: 28, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.58, ease: "power3.out", clearProps: "transform,opacity" },
            0
          );
        }

        // Stage B: Subtitle & status
        const headerMeta = [subtitleRef.current, statusBadgeRef.current].filter(Boolean);
        if (headerMeta.length > 0) {
          tl.fromTo(
            headerMeta,
            { y: 14, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.45, stagger: 0.075, ease: "power2.out", clearProps: "transform,opacity" },
            0.12
          );
        }

        // Stage C: Mandate specifications summary
        if (mandateSummaryRef.current) {
          tl.fromTo(
            mandateSummaryRef.current,
            { y: 14, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.45, ease: "power2.out", clearProps: "transform,opacity" },
            0.2
          );
        }

        // Stage D: Main 2-column grid
        if (gridRef.current) {
          tl.fromTo(
            gridRef.current,
            { y: 18, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.48, ease: "power2.out", clearProps: "transform,opacity" },
            0.28
          );
        }
      });
      return () => media.revert();
    },
    { scope: containerRef, dependencies: [] }
  );

  // Live Turn Streaming Transitions
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReduced && events.length > prevEventsCountRef.current && feedRef.current) {
      const items = feedRef.current.querySelectorAll<HTMLLIElement>(".arena-event-item");
      const newItemsCount = events.length - prevEventsCountRef.current;
      if (newItemsCount > 0 && items.length > 0) {
        const newItems = Array.from(items).slice(-newItemsCount);
        gsap.fromTo(
          newItems,
          { opacity: 0, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            stagger: 0.05,
            ease: "power2.out",
            clearProps: "transform,opacity",
          }
        );
      }
    }
    prevEventsCountRef.current = events.length;

    // Follow new turns only while reader is near bottom
    const feed = feedRef.current;
    if (isStreaming && followRef.current && feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, [events, isStreaming]);

  // Agreement Formation Fluid Transition
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReduced && hasDeal && !prevDealRef.current && agreementRef.current) {
      gsap.fromTo(
        agreementRef.current,
        { opacity: 0, y: 16, scale: 0.985 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.52,
          ease: "power2.out",
          clearProps: "transform,opacity,scale",
        }
      );
    }
    prevDealRef.current = hasDeal;
  }, [hasDeal]);

  const start = async () => {
    if (startClaim.current || !canStart || isStreaming) return;
    startClaim.current = true;
    setStarting(true);
    setStartError(false);
    try {
      await onStartNegotiation?.();
    } catch {
      setStartError(true);
    } finally {
      startClaim.current = false;
      setStarting(false);
    }
  };

  const supplierName = (payload: Record<string, unknown>) =>
    String(
      payload.vendorName ??
        quotes.find((quote) => quote.vendorId === payload.vendorId)?.vendorName ??
        payload.vendorId ??
        "Supplier not recorded"
    );
  const sourceName = (generator: unknown) =>
    generator === "GEMINI_LIVE"
      ? "Gemini"
      : generator === "DETERMINISTIC_FALLBACK"
      ? "deterministic fallback"
      : "source not recorded";

  return (
    <div ref={containerRef} className="space-y-6 text-text-primary min-w-0">
      {/* Header with clipping mask for Stage A & B */}
      <header className="space-y-4 border-b border-border-primary pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="overflow-hidden pb-1 -mb-1">
              <h1
                ref={headingRef}
                className="workspace-title translate-y-0 opacity-100 will-change-transform"
              >
                Negotiation Arena
              </h1>
            </div>
            <p ref={subtitleRef} className="text-sm text-text-secondary translate-y-0 opacity-100">
              Compare supplier terms and review the recorded negotiation.
            </p>
          </div>
          <p
            ref={statusBadgeRef}
            role="status"
            className={`text-sm font-medium py-2 translate-y-0 opacity-100 ${
              isStreaming ? "text-ember-orange animate-pulse" : ""
            }`}
          >
            {loading && !authoritativeMandate ? "Loading saved negotiation…" : state}
            {round > 0 && (
              <>
                {" "}
                · Round {round}
                {typeof maxRounds === "number" ? ` of ${maxRounds}` : ""}
              </>
            )}
          </p>
        </div>

        {authoritativeMandate ? (
          <dl
            ref={mandateSummaryRef}
            className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 text-sm translate-y-0 opacity-100"
          >
            <div className="col-span-2 md:col-span-1 min-w-0">
              <dt className="text-text-secondary mb-1">Procurement request</dt>
              <dd className="font-medium break-words">{authoritativeMandate.itemQuery}</dd>
            </div>
            <div>
              <dt className="text-text-secondary mb-1">Quantity</dt>
              <dd className="tabular-nums">{authoritativeMandate.quantity} units</dd>
            </div>
            <div>
              <dt className="text-text-secondary mb-1">Budget ceiling</dt>
              <dd className="font-mono-token tabular-nums break-words">
                {money(authoritativeMandate.maxTotalBudget)} {currency}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary mb-1">Required terms</dt>
              <dd>
                Delivery ≤ {authoritativeMandate.maxDeliveryDays} days
                <br />
                Returns ≥ {authoritativeMandate.minReturnDays} days
              </dd>
            </div>
          </dl>
        ) : (
          !error && (
            <p className="text-sm text-text-secondary">
              {loading || isStreaming
                ? "Loading saved procurement requirements…"
                : "Open a procurement request from Sourcing or History to view its negotiation."}
            </p>
          )
        )}
        {(sessionId || session?.id) && (
          <p className="text-xs text-text-secondary break-all">
            Session <span className="font-mono-token">{sessionId ?? session?.id}</span>
          </p>
        )}
      </header>

      {error && (
        <section
          role="alert"
          className="border border-border-primary rounded-[6px] bg-surface-primary p-5 space-y-3"
        >
          <h2 className="font-semibold">Saved negotiation unavailable</h2>
          <p className="text-sm">{error}</p>
          {onRetry && (
            <GhostButton onClick={onRetry} className="min-h-11">
              Reload saved session
            </GhostButton>
          )}
        </section>
      )}

      {failed && (
        <section
          role="alert"
          className="border border-border-primary rounded-[6px] bg-surface-primary p-5 space-y-3"
        >
          <h2 className="text-lg font-semibold">Negotiation could not complete</h2>
          <p className="text-sm">
            {negotiationFailureMessage(
              String(terminal?.payload.code ?? session?.negotiationFailure?.code ?? "NEGOTIATION_UNEXPECTED")
            )}
          </p>
          <p className="text-sm text-text-secondary">Review the saved history before starting another attempt.</p>
          {failureReference && (
            <p className="text-xs text-text-secondary break-all">
              Diagnostic reference: {String(failureReference)}
            </p>
          )}
          <GhostButton onClick={() => window.location.reload()} className="min-h-11">
            Reload saved session
          </GhostButton>
        </section>
      )}

      {stopped && (
        <p role="status" className="border border-border-primary rounded-[6px] p-5 text-sm">
          {String(terminal?.payload.reason ?? terminal?.payload.error ?? "The session no longer meets the requirements to proceed.")}
        </p>
      )}

      {fallback && (
        <p className="text-sm text-text-secondary">
          Some proposals used the deterministic fallback. They are not live model results.
        </p>
      )}

      {/* Stage 5: Agreement Formation Banner */}
      {hasDeal && (
        <section
          ref={agreementRef}
          aria-label="Final agreement"
          className="border border-border-primary border-l-[3px] border-l-ember-orange rounded-[6px] bg-surface-primary p-5 sm:p-6 space-y-5 transition-shadow duration-200"
        >
          <div className="flex flex-wrap justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-mint-primary" />
                Consensus Reached with {String(winner ?? "supplier not recorded")}
              </h2>
              <p className="text-sm text-text-secondary">
                Simulated agreement recorded. Supplier commitment has not been independently verified. Payment has not been initiated by this screen.
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">
                Agreed total · {currency ?? "Currency not recorded"}
              </p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{money(total)}</p>
            </div>
          </div>
          {agreedOffer && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t border-border-primary pt-4">
              <div>
                <dt className="text-text-secondary">Unit price</dt>
                <dd className="tabular-nums mt-1 font-medium">{money(agreedOffer.unitPrice)}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Shipping</dt>
                <dd className="tabular-nums mt-1">{money(agreedOffer.shippingCost)}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Delivery</dt>
                <dd className="mt-1">
                  {agreedOffer.deliveryDays === undefined
                    ? "Not recorded"
                    : `${agreedOffer.deliveryDays} ${agreedOffer.deliveryDays === 1 ? "day" : "days"}`}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Returns</dt>
                <dd className="mt-1">
                  {agreedOffer.returnDays === undefined
                    ? "Not recorded"
                    : `${agreedOffer.returnDays} days`}
                </dd>
              </div>
            </dl>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-primary pt-4">
            <p className="text-sm text-text-secondary max-w-xl">
              {session?.status === "CANCELLED"
                ? "This session is cancelled. The recorded agreement is retained for review."
                : "Review ACWORLD audit and settlement eligibility next. PayPal authorization requires a separate action."}
            </p>
            {onProceedToSettlement && !isStreaming && session?.status !== "CANCELLED" && (
              <PrimaryButton onClick={onProceedToSettlement} className="min-h-11">
                Review audit and settlement
              </PrimaryButton>
            )}
          </div>
        </section>
      )}

      {noDeal && (
        <section role="status" className="border border-border-primary rounded-[6px] p-5 space-y-2">
          <h2 className="text-lg font-semibold">No agreement reached</h2>
          <p className="text-sm text-text-secondary">
            {String(completed?.payload.reason ?? "No supplier offer met the required terms.")}
          </p>
          <p className="text-sm text-text-secondary">
            Settlement is unavailable. Review the mandate in Sourcing before starting a new request.
          </p>
        </section>
      )}

      {/* Main Grid: Supplier terms and Negotiation history */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)] gap-6 items-start translate-y-0 opacity-100"
      >
        <OperationsPanel
          title="Supplier terms"
          action={<span className="text-sm text-text-secondary">{quotes.length} available</span>}
        >
          {!authoritativeMandate || !quotes.length ? (
            <p className="p-5 text-sm text-text-secondary">
              {loading ? "Loading supplier terms…" : "No supplier terms available for this request."}
            </p>
          ) : (
            <div className="divide-y divide-border-primary sm:grid sm:grid-cols-2 xl:block sm:divide-y-0 xl:divide-y">
              {quotes.map((quote) => {
                const latest = events
                  .filter(
                    (event) =>
                      event.payload.vendorId === quote.vendorId &&
                      ["VENDOR_COUNTEROFFER", "VENDOR_ACCEPTANCE", "BUYER_ACCEPTANCE"].includes(event.type)
                  )
                  .at(-1);
                const ask =
                  number(latest?.payload.unitPrice ?? latest?.payload.newUnitAsk) ??
                  quote.currentUnitBid ??
                  quote.initialUnitAsk;
                const totalMinor =
                  toMinorUnits(ask) * authoritativeMandate.quantity + toMinorUnits(quote.shippingCost);
                const valid =
                  (!quote.currency || quote.currency === currency) &&
                  Number.isSafeInteger(totalMinor) &&
                  totalMinor >= 0;
                const isWinner = hasDeal && (winnerId === quote.vendorId || winner === quote.vendorName);

                return (
                  <article
                    key={quote.vendorId}
                    className={`p-5 space-y-4 min-w-0 transition-colors duration-150 ${
                      isWinner
                        ? "bg-surface-secondary/40 border-l-2 border-ember-orange"
                        : "hover:bg-surface-secondary/20"
                    }`}
                  >
                    <div>
                      <h3 className="font-semibold break-words">{quote.vendorName}</h3>
                      <p className="text-xs text-text-secondary mt-1 break-words">
                        {quote.productTitle || quote.sku}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {quote.dataSource === "MOCK_CATALOG"
                          ? "Demonstration supplier"
                          : `Source: ${quote.dataSource}`}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-text-secondary">Initial unit ask</dt>
                        <dd className="tabular-nums mt-1">
                          {quote.currency && quote.currency !== currency
                            ? formatCurrency(quote.initialUnitAsk, quote.currency)
                            : money(quote.initialUnitAsk)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Latest unit ask</dt>
                        <dd className="tabular-nums mt-1 font-medium">
                          {valid ? money(ask) : "Currency or amount unavailable"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Shipping</dt>
                        <dd className="tabular-nums mt-1">{valid ? money(quote.shippingCost) : "Not available"}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Landed total</dt>
                        <dd className="font-medium tabular-nums mt-1">
                          {valid ? money(fromMinorUnits(totalMinor)) : "Not available"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Initial delivery</dt>
                        <dd className="mt-1">{quote.deliveryDays} days</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Initial returns</dt>
                        <dd className="mt-1">{quote.returnDays} days</dd>
                      </div>
                    </dl>
                    <p className="text-sm border-t border-border-primary pt-3">
                      {isWinner
                        ? "Selected agreement"
                        : latest?.type?.includes("ACCEPTANCE")
                        ? "Offer accepted"
                        : latest
                        ? "Counteroffer recorded"
                        : "Starting offer"}
                    </p>
                    {valid && (
                      <p className="text-xs text-text-secondary">
                        {totalMinor > toMinorUnits(authoritativeMandate.maxTotalBudget)
                          ? "Above budget; price requires negotiation"
                          : "Within budget ceiling"}
                        . Full eligibility depends on the server policy evaluation.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </OperationsPanel>

        <OperationsPanel
          title="Negotiation history"
          action={
            <span className="text-sm text-text-secondary">
              {isStreaming ? "Receiving turns" : "Recorded turns"}
            </span>
          }
        >
          {!events.length ? (
            <div className="p-5 sm:p-6 space-y-4">
              <p className="font-medium">
                {isStreaming
                  ? "Initializing Negotiation..."
                  : authoritativeMandate
                  ? "Ready to negotiate"
                  : "No negotiation loaded"}
              </p>
              <p className="text-sm text-text-secondary">
                Baseline supplier asking prices are starting commercial positions, not accepted agreements.
                Proposals must satisfy the mandate before an agreement can be recorded.
              </p>
              {onStartNegotiation && authoritativeMandate && (
                <PrimaryButton
                  onClick={() => void start()}
                  disabled={!canStart || isStreaming || starting}
                  className="min-h-11"
                >
                  {isStreaming || starting ? "Initializing Negotiation..." : "Start Negotiation"}
                </PrimaryButton>
              )}
              {startError && (
                <p role="alert" className="text-sm">
                  Negotiation could not start. Reload the saved session before retrying.
                </p>
              )}
            </div>
          ) : (
            <div
              ref={feedRef}
              onScroll={() => {
                const feed = feedRef.current;
                if (feed) {
                  followRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 64;
                }
              }}
              tabIndex={0}
              aria-label="Negotiation timeline log"
              className="max-h-[640px] overflow-y-auto focus-visible:outline-2 focus-visible:outline-ember-orange focus-visible:outline-offset-2"
            >
              <ol className="divide-y divide-border-primary">
                {events.map((event) => {
                  const p = event.payload;
                  const offer = p.proposedOffer as
                    | { unitPrice?: number; deliveryDays?: number; returnDays?: number }
                    | undefined;
                  const isPolicy = ["GUARDRAIL_BLOCKED", "GUARDRAIL_INTERVENTION"].includes(event.type);
                  let title: string;
                  if (event.type === "ROUND_STARTED") {
                    title = `Round ${p.round}${typeof p.maxRounds === "number" ? ` of ${p.maxRounds}` : ""}`;
                  } else if (event.type === "BUYER_PROPOSAL") {
                    title = `Buyer proposal (${sourceName(p.generator)}) → ${supplierName(p)}`;
                  } else if (event.type === "VENDOR_COUNTEROFFER") {
                    title = `${supplierName(p)} counteroffer`;
                  } else if (event.type === "VENDOR_ACCEPTANCE") {
                    title = `Simulated supplier acceptance (${supplierName(p)})`;
                  } else if (event.type === "BUYER_ACCEPTANCE") {
                    title = `Buyer Accepted Counteroffer (${supplierName(p)})`;
                  } else if (isPolicy) {
                    title = event.type === "GUARDRAIL_BLOCKED" ? "Policy blocked proposal" : "Policy intervention";
                  } else if (event.type === "ROUND_COMPLETED") {
                    title = `Round ${p.round} saved`;
                  } else if (event.type === "NEGOTIATION_COMPLETED") {
                    title = "Negotiation run ended";
                  } else if (event.type === "NEGOTIATION_FAILED") {
                    title = "Negotiation failed";
                  } else if (event.type === "NEGOTIATION_ABORTED") {
                    title = "Negotiation stopped by session or policy change";
                  } else if (event.type === "SOURCING_EVALUATED") {
                    title = "Supplier evaluation recorded";
                  } else if (event.type === "NEGOTIATION_STARTED") {
                    title = "Negotiation started";
                  } else {
                    return null;
                  }
                  const message = p.message ?? (p.turn as { message?: string } | undefined)?.message;

                  // Semantic policy/status styling
                  const borderClass =
                    event.type === "GUARDRAIL_BLOCKED"
                      ? "border-l-2 border-l-red-500 bg-red-50/20 dark:bg-red-950/20"
                      : event.type === "GUARDRAIL_INTERVENTION"
                      ? "border-l-2 border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/20"
                      : event.type.includes("ACCEPTANCE")
                      ? "border-l-2 border-l-mint-primary bg-mint-subtle/20"
                      : event.type === "BUYER_PROPOSAL"
                      ? "border-l-2 border-l-lavender-primary/60"
                      : "";

                  return (
                    <li
                      key={event.id}
                      data-event-id={event.id}
                      className={`arena-event-item p-5 space-y-3 text-sm break-words transition-colors duration-150 hover:bg-surface-secondary/20 ${borderClass}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-medium flex items-center gap-1.5">
                          {event.type === "GUARDRAIL_BLOCKED" && (
                            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                          )}
                          {event.type === "GUARDRAIL_INTERVENTION" && (
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                          {event.type.includes("ACCEPTANCE") && (
                            <CheckCircle2 className="w-4 h-4 text-mint-primary shrink-0" />
                          )}
                          <span>{title}</span>
                        </h3>
                        {!Number.isNaN(Date.parse(event.timestamp)) && (
                          <time
                            dateTime={event.timestamp}
                            className="text-xs text-text-secondary tabular-nums"
                          >
                            {new Date(event.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        )}
                      </div>
                      {event.type === "BUYER_PROPOSAL" && offer && (
                        <p className="flex flex-wrap gap-x-4 gap-y-2 tabular-nums">
                          <span>
                            Unit Bid: <strong className="font-medium">{money(offer.unitPrice)}</strong>
                          </span>
                          {offer.deliveryDays !== undefined && (
                            <span>Delivery {offer.deliveryDays} days</span>
                          )}
                          {offer.returnDays !== undefined && (
                            <span>Returns {offer.returnDays} days</span>
                          )}
                        </p>
                      )}
                      {event.type === "VENDOR_COUNTEROFFER" && (
                        <p className="tabular-nums font-medium">New Ask: {money(p.newUnitAsk)}</p>
                      )}
                      {event.type.includes("ACCEPTANCE") && (
                        <>
                        <p className="tabular-nums font-medium">Agreed Unit: {money(p.unitPrice ?? p.agreedPrice ?? (p.turn as { proposedOffer?: { unitPrice?: number } } | undefined)?.proposedOffer?.unitPrice)}</p>
                        <p className="text-xs text-text-secondary">Simulation only; no independently verified supplier commitment.</p>
                        </>
                      )}
                      {isPolicy && (
                        <>
                          <p className="text-text-secondary">
                            {String(
                              p.reason ??
                                p.detail ??
                                "A proposal did not satisfy the required policy checks."
                            )}
                          </p>
                          <p className="text-text-secondary">Supplier: {supplierName(p)}</p>
                          <details className="group">
                            <summary className="min-h-11 flex items-center cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ember-orange">
                              Verification details
                            </summary>
                            <p className="text-xs text-text-secondary break-all pt-2">
                              Recorded decision: {event.type}
                            </p>
                          </details>
                        </>
                      )}
                      {number(p.utilityScore) !== undefined && (
                        <p className="text-xs text-text-secondary tabular-nums">
                          Utility: {Number(p.utilityScore).toFixed(3)}
                          {number(p.threshold) !== undefined
                            ? ` · Required ${Number(p.threshold).toFixed(3)}`
                            : ""}
                        </p>
                      )}
                      {typeof message === "string" && message && (
                        <details className="group">
                          <summary className="min-h-11 flex items-center cursor-pointer underline underline-offset-4 text-text-secondary focus-visible:outline-2 focus-visible:outline-ember-orange">
                            Proposal reasoning
                          </summary>
                          <p className="text-text-secondary leading-relaxed pt-2 whitespace-pre-wrap">
                            {message}
                          </p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </OperationsPanel>
      </div>
    </div>
  );
}
