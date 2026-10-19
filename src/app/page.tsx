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
  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/procurement/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (activeSession) {
          const updated = (data.sessions as ProcurementSession[])?.find(
            (s) => s.id === activeSession.id
          );
          if (updated) setActiveSession(updated);
        }
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  }, [activeSession]);

  useEffect(() => {
    refreshSessions();
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
  const handleStartNegotiation = async (prompt: string, currency: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setStreamEvents([]);
    setIsStreaming(true);
    setCurrentScreen("arena");

    try {
      const res = await fetch("/api/negotiate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, currency }),
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
              // Refresh server-side sessions
              setTimeout(() => {
                refreshSessions();
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
    setCurrentScreen("settlement");
  };

  const activeBudgetString = arenaMandate
    ? `Budget: $${arenaMandate.maxTotalBudget.toLocaleString()} ${arenaMandate.currency}`
    : activeSession
    ? `Budget: $${activeSession.mandate.maxTotalBudget.toLocaleString()} ${activeSession.mandate.currency}`
    : undefined;

  return (
    <AppShell
      currentScreen={currentScreen}
      onNavigate={(screen) => setCurrentScreen(screen)}
      activeSessionId={arenaSessionId || activeSession?.id}
      activeBudgetString={activeBudgetString}
    >
      {currentScreen === "overview" && (
        <OverviewScreen
          sessions={sessions}
          onStartNew={() => setCurrentScreen("sourcing")}
          onOpenSession={handleOpenSession}
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
            await refreshSessions();
            if (arenaSessionId) {
              const matched = sessions.find((s) => s.id === arenaSessionId);
              if (matched) setActiveSession(matched);
            }
            setCurrentScreen("settlement");
          }}
        />
      )}

      {currentScreen === "vault" && (
        <EvidenceVaultScreen session={activeSession || sessions[0]} />
      )}

      {currentScreen === "settlement" && (
        <SettlementCenterScreen
          session={activeSession || sessions[0]}
          onRefreshSession={refreshSessions}
        />
      )}

      {currentScreen === "history" && (
        <ProcurementHistoryScreen
          sessions={sessions}
          onSelectSession={handleOpenSession}
          onStartNew={() => setCurrentScreen("sourcing")}
        />
      )}
    </AppShell>
  );
}
