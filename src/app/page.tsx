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
      if (sessionParam) {
        const matched = loaded.find((s) => s.id === sessionParam);
        if (matched) {
          setActiveSession(matched);
          setArenaSessionId(matched.id);
          setArenaMandate(matched.mandate);
          setArenaQuotes(matched.quotes || []);
          return;
        }
      }
      if (loaded.length > 0) {
        setActiveSession(loaded[0]);
        setArenaSessionId(loaded[0].id);
        setArenaMandate(loaded[0].mandate);
        setArenaQuotes(loaded[0].quotes || []);
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

  // Handle launch of negotiation from Sourcing or Overview
  const handleStartNegotiation = async (
    prompt: string,
    currency: string,
    rawMandate?: Partial<ProcurementMandate>,
    sessionId?: string
  ) => {
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

  const handleOpenSession = (session: ProcurementSession) => {
    setActiveSession(session);
    setArenaSessionId(session.id);
    setArenaMandate(session.mandate);
    setArenaQuotes(session.quotes || []);

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
    ? `Budget: $${arenaMandate.maxTotalBudget.toLocaleString()} ${arenaMandate.currency}`
    : activeSession
    ? `Budget: $${activeSession.mandate.maxTotalBudget.toLocaleString()} ${activeSession.mandate.currency}`
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
          sessionId={arenaSessionId}
          mandate={arenaMandate}
          quotes={arenaQuotes}
          events={streamEvents}
          isStreaming={isStreaming}
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
