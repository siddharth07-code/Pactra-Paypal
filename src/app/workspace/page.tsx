"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { OrganizationBoundary } from "@/components/OrganizationBoundary";
import { AppShell, NavScreen } from "@/components/AppShell";
import { useWorkspaceTransition } from "@/components/workspace-transition";
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
        timestamp: turn.timestamp || "",
        payload: { round: currentRound },
      });
    }

    if (turn.guardrailStatus === "GUARDRAIL_BLOCKED" || turn.guardrailStatus === "GUARDRAIL_INTERVENTION") {
      events.push({
        id: turn.id || `turn_gr_${i}`,
        type: turn.guardrailStatus,
        timestamp: turn.timestamp || "",
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
          timestamp: turn.timestamp || "",
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
          timestamp: turn.timestamp || "",
          payload: {
            round: turn.round,
            vendorId: turn.vendorId,
            message: turn.message,
            proposedOffer: turn.proposedOffer,
            utilityScore: turn.utilityScore,
            threshold: turn.boulwareThreshold,
            generator: turn.generator,
          },
        });
      }
    } else if (turn.actor === "VENDOR") {
      if (turn.turnType === "ACCEPTANCE") {
        events.push({
          id: turn.id || `turn_va_${i}`,
          type: "VENDOR_ACCEPTANCE",
          timestamp: turn.timestamp || "",
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
          timestamp: turn.timestamp || "",
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
      timestamp: session.agreementRecord.acceptedAt || "",
      payload: {
        outcome: "ACCEPTED",
        selectedVendor: session.agreementRecord.vendorName,
        winningVendorId: session.agreementRecord.vendorId,
        totalCost: session.agreementRecord.totalCost,
        finalOffer: session.agreementRecord.agreedOffer,
      },
    });
  } else if (session.turns.length > 0 && session.status === "AUDIT_FAILED") {
    events.push({
      id: `ev_no_deal_${session.id}`,
      type: "NEGOTIATION_COMPLETED",
      timestamp: session.updatedAt,
      payload: {
        outcome: "NO_DEAL",
        reason: "No competing vendor counteroffer satisfied mandatory budget and SLA constraints.",
      },
    });
  }

  return events;
}

function Home() {
  const [currentScreen, setCurrentScreen] = useState<NavScreen>("overview");
  const [sessions, setSessions] = useState<ProcurementSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
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
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const res = await fetch("/api/procurement/sessions");
      if (res.ok) {
        const data = await res.json();
        const loaded: ProcurementSession[] = data.sessions || [];
        setSessions(loaded);
        setActiveSession((current) => {
          if (!current) return current;
          return loaded.find((s) => s.id === current.id) || current;
        });
        return loaded;
      }
      setSessionsError("Procurement records could not be retrieved. Try again.");
    } catch (err) {
      setSessionsError("Procurement records could not be retrieved. Check your connection and try again.");
      console.error("Failed to fetch sessions:", err);
    } finally {
      setSessionsLoading(false);
    }
    return [];
  }, []);

  const transition = useWorkspaceTransition();
  const navigationVersion = useRef(0);
  const displayedScreen = useRef<NavScreen>("overview");
  const requestedScreen = useRef<NavScreen>("overview");
  const entry = useRef(0);
  const nextEntry = useRef(0);
  const scrollPositions = useRef(new Map<number, number>());

  const applySession = useCallback((session: ProcurementSession | undefined, id?: string) => {
    setActiveSession(session);
    setArenaSessionId(id ?? session?.id);
    setArenaMandate(session?.mandate);
    setArenaQuotes(session?.quotes ?? []);
    setStreamEvents(session ? convertSessionTurnsToStreamEvents(session) : []);
  }, []);

  const showScreen = useCallback((screen: NavScreen, update: () => void, scroll: number) => {
    const changed = screen !== displayedScreen.current;
    transition(() => {
      displayedScreen.current = screen;
      setCurrentScreen(screen);
      update();
    }, changed && screen !== "history" && displayedScreen.current !== "history", changed ? scroll : undefined);
  }, [transition]);

  const navigateToScreen = useCallback((screen: NavScreen, sessionId?: string) => {
    navigationVersion.current++;
    const freshSourcing = screen === "sourcing" && !sessionId;
    const targetSessionId = freshSourcing ? undefined : sessionId || arenaSessionId || activeSession?.id;
    const url = new URL(window.location.href);
    url.searchParams.set("screen", screen);
    if (targetSessionId) url.searchParams.set("sessionId", targetSessionId);
    else url.searchParams.delete("sessionId");

    const changed = screen !== requestedScreen.current;
    requestedScreen.current = screen;
    if (changed) {
      scrollPositions.current.set(entry.current, window.scrollY);
      entry.current = ++nextEntry.current;
      window.history.pushState({ pactumEntry: entry.current }, "", url);
    } else if (url.href !== window.location.href) {
      window.history.replaceState({ ...window.history.state, pactumEntry: entry.current }, "", url);
    }

    showScreen(screen, () => {
      if (freshSourcing) applySession(undefined);
    }, 0);
  }, [activeSession, applySession, arenaSessionId, showScreen]);

  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const value = params.get("screen");
      const screen = (["overview", "sourcing", "arena", "vault", "settlement", "history"].includes(value ?? "")
        ? value : "overview") as NavScreen;
      return { screen, id: params.get("sessionId") ?? undefined };
    };

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    entry.current = window.history.state?.pactumEntry ?? 0;
    nextEntry.current = Math.max(nextEntry.current, entry.current);
    const initial = readLocation();
    requestedScreen.current = initial.screen;
    displayedScreen.current = initial.screen;
    setCurrentScreen(initial.screen);
    setArenaSessionId(initial.id);

    const hydrate = ({ screen, id }: ReturnType<typeof readLocation>, loaded: ProcurementSession[]) => {
      const matched = id ? loaded.find((session) => session.id === id) : screen === "sourcing" ? undefined : loaded[0];
      applySession(matched, id);
      if (id && !matched) {
        setSessionsError("The selected procurement session is unavailable. Check the organization and session link, then reload.");
      }
    };

    const initialVersion = navigationVersion.current;
    let mounted = true;
    const pending = refreshSessions();
    void pending.then((loaded) => {
      if (mounted && initialVersion === navigationVersion.current) hydrate(initial, loaded);
    });

    const onPopState = (event: PopStateEvent) => {
      const version = ++navigationVersion.current;
      scrollPositions.current.set(entry.current, window.scrollY);
      entry.current = event.state?.pactumEntry ?? 0;
      const destination = readLocation();
      requestedScreen.current = destination.screen;
      showScreen(destination.screen, () => {
        setSessionsError("");
        if (sessionsRef.current.length) {
          hydrate(destination, sessionsRef.current);
        } else {
          applySession(undefined, destination.id);
          void pending.then((loaded) => {
            if (mounted && version === navigationVersion.current) hydrate(destination, loaded);
          });
        }
      }, scrollPositions.current.get(entry.current) ?? 0);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      mounted = false;
      window.removeEventListener("popstate", onPopState);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [applySession, refreshSessions, showScreen]);

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
    const negotiationEntry = entry.current;

    try {
      const res = await fetch("/api/negotiate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, currency, rawMandate, sessionId }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const code = res.status === 401 ? "AUTH_REQUIRED" : res.status === 403 ? "PERMISSION_DENIED" : res.status === 409 ? "STALE_VERSION" : "SERVICE_UNAVAILABLE";
        setStreamEvents(previous => [...previous, { id: `rejected_${Date.now()}`, type: "NEGOTIATION_FAILED", timestamp: new Date().toISOString(), payload: { code } }]);
        void refreshSessions();
        return;
      }

      if (!res.body) {
        throw new Error("No readable response stream available.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminalReceived = false;

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
            if (["NEGOTIATION_COMPLETED", "NEGOTIATION_FAILED", "NEGOTIATION_ABORTED"].includes(eventType)) terminalReceived = true;
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
              if (entry.current === negotiationEntry) {
                const url = new URL(window.location.href);
                url.searchParams.set("sessionId", parsed.sessionId);
                window.history.replaceState(window.history.state, "", url.toString());
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
            } else if (["NEGOTIATION_COMPLETED", "NEGOTIATION_FAILED", "NEGOTIATION_ABORTED"].includes(eventType)) {
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
      if (!terminalReceived && !abortController.signal.aborted) {
        setStreamEvents(previous => [...previous, { id: `interrupted_${Date.now()}`, type: "NEGOTIATION_FAILED", timestamp: new Date().toISOString(), payload: { code: "STREAM_INTERRUPTED" } }]);
        void refreshSessions();
      }
    } catch {
      if (!abortController.signal.aborted) {
        setStreamEvents((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            type: "NEGOTIATION_FAILED",
            timestamp: new Date().toISOString(),
            payload: { code: "STREAM_INTERRUPTED" },
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
    setSessionsError("");
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
          loading={sessionsLoading}
          error={sessionsError}
          onRetry={() => void refreshSessions()}
          onStartNew={() => navigateToScreen("sourcing")}
          onOpenSession={handleOpenSession}
          onNavigateHistory={() => navigateToScreen("history")}
        />
      )}

      {currentScreen === "sourcing" && (
        <SourcingScreen
          key={activeSession?.id ?? "new"}
          session={activeSession}
          onSessionCreated={sessionId => {
            setArenaSessionId(sessionId);
            navigateToScreen("sourcing", sessionId);
            void refreshSessions();
          }}
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
          loading={sessionsLoading}
          error={sessionsError}
          onRetry={() => window.location.reload()}
          onProceedToSettlement={async () => {
            const version = navigationVersion.current;
            const loaded = await refreshSessions();
            if (version !== navigationVersion.current) return;
            if (arenaSessionId) {
              const matched = loaded.find((s) => s.id === arenaSessionId);
              if (matched) {
                setActiveSession(matched);
                navigateToScreen("settlement", matched.id);
                return;
              }
            }
            setSessionsError("The selected session could not be loaded. Reload it before reviewing settlement.");
          }}
        />
      )}

      {currentScreen === "vault" && (
        <EvidenceVaultScreen
          session={activeSession || (arenaSessionId ? sessions.find((s) => s.id === arenaSessionId) : undefined) || (sessions.length > 0 ? sessions[0] : undefined)}
        />
      )}

      {currentScreen === "settlement" && (
        <SettlementCenterScreen
          session={activeSession || (arenaSessionId ? sessions.find((s) => s.id === arenaSessionId) : undefined) || (sessions.length > 0 ? sessions[0] : undefined)}
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

export default function Page() { return <OrganizationBoundary><Home /></OrganizationBoundary>; }
