"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppShell, NavScreen } from "@/components/AppShell";
import { OverviewScreen } from "@/components/OverviewScreen";
import { SourcingScreen } from "@/components/SourcingScreen";
import { NegotiationArenaScreen, StreamEventItem } from "@/components/NegotiationArenaScreen";
import { EvidenceVaultScreen } from "@/components/EvidenceVaultScreen";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import { ProcurementHistoryScreen } from "@/components/ProcurementHistoryScreen";
import type { ProcurementSession, VendorQuote, ProcurementMandate } from "@/types/pactum";
import { formatSessionBudgetString } from "@/lib/currency";

function convertSessionTurnsToStreamEvents(session: ProcurementSession): StreamEventItem[] {
  if (!session.turns || session.turns.length === 0) {
    return [];
  }
  const events: StreamEventItem[] = [];
  let currentRound = 0;

  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];
    if (turn.round !== currentRound) {
      currentRound = turn.round;
      events.push({
        id: `turn_rnd_${currentRound}`,
        type: "ROUND_STARTED",
        timestamp: turn.timestamp || new Date().toISOString(),
        payload: { round: currentRound, maxRounds: 4 },
      });
    }

    if (turn.guardrailStatus === "GUARDRAIL_BLOCKED" || turn.guardrailStatus === "GUARDRAIL_INTERVENTION") {
      events.push({
        id: turn.id || `turn_gr_${i}`,
        type: turn.guardrailStatus,
        timestamp: turn.timestamp || new Date().toISOString(),
        payload: {
          round: turn.round,
          vendorId: turn.vendorId,
          reason: turn.guardrailReason,
          rejectedOffer: turn.proposedOffer,
        },
      });
    } else if (turn.actor === "BUYER") {
      if (turn.turnType === "ACCEPTANCE") {
        events.push({
          id: turn.id || `turn_ba_${i}`,
          type: "BUYER_ACCEPTANCE",
          timestamp: turn.timestamp || new Date().toISOString(),
          payload: {
            round: turn.round,
            vendorId: turn.vendorId,
            message: turn.message,
            unitPrice: turn.proposedOffer?.unitPrice,
          },
        });
      } else {
        events.push({
          id: turn.id || `turn_bp_${i}`,
          type: "BUYER_PROPOSAL",
          timestamp: turn.timestamp || new Date().toISOString(),
          payload: {
            round: turn.round,
            vendorId: turn.vendorId,
            message: turn.message,
            proposedOffer: turn.proposedOffer,
            utilityScore: turn.utilityScore,
            threshold: turn.boulwareThreshold,
          },
        });
      }
    } else if (turn.actor === "VENDOR") {
      if (turn.turnType === "ACCEPTANCE") {
        events.push({
          id: turn.id || `turn_va_${i}`,
          type: "VENDOR_ACCEPTANCE",
          timestamp: turn.timestamp || new Date().toISOString(),
          payload: {
            round: turn.round,
            vendorId: turn.vendorId,
            message: turn.message,
            unitPrice: turn.proposedOffer?.unitPrice,
          },
        });
      } else {
        events.push({
          id: turn.id || `turn_vc_${i}`,
          type: "VENDOR_COUNTEROFFER",
          timestamp: turn.timestamp || new Date().toISOString(),
          payload: {
            round: turn.round,
            vendorId: turn.vendorId,
            newUnitAsk: turn.proposedOffer?.unitPrice,
            turn: { message: turn.message },
          },
        });
      }
    }
  }

  if (session.agreementRecord) {
    events.push({
      id: `ev_completed_${session.id}`,
      type: "NEGOTIATION_COMPLETED",
      timestamp: session.agreementRecord.acceptedAt || new Date().toISOString(),
      payload: {
        outcome: "ACCEPTED",
        selectedVendor: session.agreementRecord.vendorName,
        winningVendorId: session.agreementRecord.vendorId,
        totalCost: session.agreementRecord.totalCost,
        savings: (session.mandate.maxTotalBudget || 0) - session.agreementRecord.totalCost,
        finalOffer: session.agreementRecord.agreedOffer,
      },
    });
  } else if (session.turns.length > 0 && session.status === "AUDIT_FAILED") {
    events.push({
      id: `ev_no_deal_${session.id}`,
      type: "NEGOTIATION_COMPLETED",
      timestamp: new Date().toISOString(),
      payload: {
        outcome: "NO_DEAL",
        reason: "No competing vendor counteroffer satisfied mandatory budget and SLA constraints.",
      },
    });
  }

  return events;
}

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<NavScreen>("overview");
  const [sessions, setSessions] = useState<ProcurementSession[]>([]);
  const [activeSession, setActiveSession] = useState<ProcurementSession | undefined>(undefined);

  // Negotiation Stream State
  const [streamEvents, setStreamEvents] = useState<StreamEventItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [arenaQuotes, setArenaQuotes] = useState<VendorQuote[]>([]);
  const [arenaMandate, setArenaMandate] = useState<ProcurementMandate | undefined>(undefined);
  const [arenaSessionId, setArenaSessionId] = useState<string | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load authoritative sessions from backend
  const refreshSessions = useCallback(async (): Promise<ProcurementSession[]> => {
    try {
      const res = await fetch("/api/procurement/sessions");
      if (res.ok) {
        const data = await res.json();
        const loaded: ProcurementSession[] = data.sessions || [];
        setSessions(loaded);
        return loaded;
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
    return [];
  }, []);

  const navigateToScreen = useCallback((screen: NavScreen, sessionId?: string) => {
    setCurrentScreen(screen);
    const targetSessionId = sessionId || arenaSessionId || activeSession?.id;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("screen", screen);
      if (targetSessionId) {
        url.searchParams.set("sessionId", targetSessionId);
      } else {
        url.searchParams.delete("sessionId");
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, [arenaSessionId, activeSession]);

  useEffect(() => {
    let screenParam: string | null = null;
    let sessionParam: string | null = null;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      screenParam = params.get("screen");
      sessionParam = params.get("sessionId");
      if (screenParam && ["overview", "sourcing", "arena", "vault", "settlement", "history"].includes(screenParam)) {
        setCurrentScreen(screenParam as NavScreen);
      }
      if (sessionParam) {
        setArenaSessionId(sessionParam);
      }
    }

    refreshSessions().then((loaded) => {
      let matchedSession: ProcurementSession | undefined;
      if (sessionParam) {
        matchedSession = loaded.find((s) => s.id === sessionParam);
      }
      if (!matchedSession && loaded.length > 0) {
        matchedSession = loaded[0];
      }

      if (matchedSession) {
        setActiveSession(matchedSession);
        setArenaSessionId(matchedSession.id);
        setArenaMandate(matchedSession.mandate);
        setArenaQuotes(matchedSession.quotes || []);

        // Hydrate persisted turns if no live stream is active
        if (matchedSession.turns && matchedSession.turns.length > 0) {
          setStreamEvents(convertSessionTurnsToStreamEvents(matchedSession));
        }
      }
    });
  }, [refreshSessions]);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle launch of negotiation from Sourcing, Arena, or Overview
  const handleStartNegotiation = async (
    prompt: string,
    currency: string,
    rawMandate?: Partial<ProcurementMandate>,
    sessionId?: string
  ) => {
    if (isStreaming) {
      return; // Concurrency guard: double-clicking does not create duplicate runs
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setStreamEvents([]);
    setIsStreaming(true);
    navigateToScreen("arena", sessionId);

    try {
      const res = await fetch("/api/negotiate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, currency, rawMandate, sessionId }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to establish negotiation stream (${res.status}).`);
      }

      if (!res.body) {
        throw new Error("No readable response stream available.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;

          let eventType = "message";
          let eventData = "{}";

          const sublines = block.split("\n");
          for (const line of sublines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.replace("data: ", "").trim();
            }
          }

          try {
            const parsed = JSON.parse(eventData);
            const streamItem: StreamEventItem = {
              id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              type: eventType,
              timestamp: new Date().toISOString(),
              payload: parsed,
            };

            setStreamEvents((prev) => [...prev, streamItem]);

            // React to milestone stream events
            if (eventType === "SOURCING_COMPLETED") {
              setArenaQuotes(parsed.quotes || []);
              setArenaMandate(parsed.mandate);
            } else if (eventType === "SESSION_INITIALIZED") {
              setArenaSessionId(parsed.sessionId);
              // Also update URL with authoritative session ID
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("sessionId", parsed.sessionId);
                window.history.replaceState({}, "", url.toString());
              }
            } else if (eventType === "VENDOR_COUNTEROFFER") {
              // Update live quote bids in arena panels
              setArenaQuotes((prev) =>
                prev.map((q) =>
                  q.vendorId === parsed.vendorId
                    ? { ...q, currentUnitBid: parsed.newUnitAsk }
                    : q
                )
              );
            } else if (eventType === "NEGOTIATION_COMPLETED") {
              // Refresh server-side sessions to pull authoritative completed session
              setTimeout(async () => {
                const loaded = await refreshSessions();
                if (parsed.sessionId) {
                  const completed = loaded.find((s) => s.id === parsed.sessionId);
                  if (completed) {
                    setActiveSession(completed);
                  }
                }
              }, 500);
            }
          } catch {
            // Ignore malformed individual chunk
          }
        }
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        const message = err instanceof Error ? err.message : "Negotiation stream error";
        setStreamEvents((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            type: "NEGOTIATION_FAILED",
            timestamp: new Date().toISOString(),
            payload: { error: message },
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleArenaStartNegotiation = async () => {
    if (isStreaming) return;

    const target =
      activeSession ||
      (arenaSessionId ? sessions.find((s) => s.id === arenaSessionId) : undefined);

    if (target) {
      if (
        target.agreementRecord ||
        target.status === "SETTLED" ||
        target.status === "AUDIT_PASSED" ||
        target.status === "PAYPAL_CAPTURED"
      ) {
        // Completed negotiations must not be restarted
        return;
      }
      await handleStartNegotiation(
        target.mandate.rawPrompt,
        target.mandate.currency || "USD",
        target.mandate,
        target.id
      );
    } else if (arenaMandate) {
      await handleStartNegotiation(
        arenaMandate.rawPrompt,
        arenaMandate.currency || "USD",
        arenaMandate,
        arenaSessionId
      );
    }
  };

  const handleOpenSession = (session: ProcurementSession) => {
    setActiveSession(session);
    setArenaSessionId(session.id);
    setArenaMandate(session.mandate);
    setArenaQuotes(session.quotes || []);

    // Hydrate existing turns for completed or in-progress session
    if (session.turns && session.turns.length > 0) {
      setStreamEvents(convertSessionTurnsToStreamEvents(session));
    } else {
      setStreamEvents([]);
    }

    // Lifecycle-aware routing: Navigate based on authoritative session state
    if (session.status === "MANDATE_PENDING" || session.status === "SOURCING") {
      navigateToScreen("sourcing", session.id);
    } else if (session.status === "NEGOTIATING") {
      navigateToScreen("arena", session.id);
    } else {
      navigateToScreen("settlement", session.id);
    }
  };

  const handleSessionUpdated = (updated: ProcurementSession) => {
    setActiveSession(updated);
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const activeBudgetString = arenaMandate
    ? formatSessionBudgetString(arenaMandate.maxTotalBudget, arenaMandate.currency)
    : activeSession
    ? formatSessionBudgetString(activeSession.mandate.maxTotalBudget, activeSession.mandate.currency)
    : undefined;

  return (
    <AppShell
      currentScreen={currentScreen}
      onNavigate={(screen) => navigateToScreen(screen)}
      activeSessionId={arenaSessionId || activeSession?.id}
      activeBudgetString={activeBudgetString}
      isNegotiating={isStreaming || activeSession?.status === "NEGOTIATING"}
    >
      {currentScreen === "overview" && (
        <OverviewScreen
          sessions={sessions}
          onStartNew={() => navigateToScreen("sourcing")}
          onOpenSession={handleOpenSession}
          onNavigateHistory={() => navigateToScreen("history")}
        />
      )}

      {currentScreen === "sourcing" && (
        <SourcingScreen
          onStartNegotiation={handleStartNegotiation}
          isLoading={isStreaming}
        />
      )}

      {currentScreen === "arena" && (
        <NegotiationArenaScreen
          sessionId={arenaSessionId || activeSession?.id}
          mandate={arenaMandate || activeSession?.mandate}
          quotes={arenaQuotes.length > 0 ? arenaQuotes : activeSession?.quotes || []}
          events={streamEvents}
          isStreaming={isStreaming}
          session={activeSession}
          onStartNegotiation={handleArenaStartNegotiation}
          onProceedToSettlement={async () => {
            const loaded = await refreshSessions();
            if (arenaSessionId) {
              const matched = loaded.find((s) => s.id === arenaSessionId);
              if (matched) {
                setActiveSession(matched);
                navigateToScreen("settlement", matched.id);
                return;
              }
            }
            if (loaded.length > 0) {
              setActiveSession(loaded[0]);
              setArenaSessionId(loaded[0].id);
              navigateToScreen("settlement", loaded[0].id);
            } else {
              navigateToScreen("settlement");
            }
          }}
        />
      )}

      {currentScreen === "vault" && (
        <EvidenceVaultScreen session={activeSession || (sessions.length > 0 ? sessions[0] : undefined)} />
      )}

      {currentScreen === "settlement" && (
        <SettlementCenterScreen
          session={activeSession || (sessions.length > 0 ? sessions[0] : undefined)}
          onRefreshSession={refreshSessions}
          onStartNewNegotiation={() => navigateToScreen("sourcing")}
          onSelectSessionHistory={() => navigateToScreen("history")}
          onSessionUpdated={handleSessionUpdated}
        />
      )}

      {currentScreen === "history" && (
        <ProcurementHistoryScreen
          sessions={sessions}
          onSelectSession={handleOpenSession}
          onStartNew={() => navigateToScreen("sourcing")}
        />
      )}
    </AppShell>
  );
}
