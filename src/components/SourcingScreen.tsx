"use client";

import React, { useEffect, useRef, useState } from "react";
import { PrimaryButton, GhostButton, FormInput, CurrencyDisplay } from "./SharedUI";
import { OperationsPanel, DataMessage, LedgerTable } from "./OperationsUI";
import { useOrganization } from "./OrganizationBoundary";
import { evaluateNegotiationCandidate } from "@/lib/sourcing-evaluator";
import { INTERNAL_SUPPORTED_CURRENCIES, toMinorUnits } from "@/lib/currency";
import type { CurrencyCode, ProcurementMandate, ProcurementSession, QuoteEvaluation, VendorQuote } from "@/types/pactum";

interface SourcingScreenProps {
  onStartNegotiation: (prompt: string, currency: string, rawMandate?: Partial<ProcurementMandate>, sessionId?: string) => void | Promise<void>;
  onSessionCreated?: (sessionId: string) => void;
  session?: ProcurementSession;
  isLoading?: boolean;
}
interface Fields { itemQuery: string; quantity: string; budget: string; delivery: string; returns: string; currency: CurrencyCode }
type Errors = Partial<Record<keyof Fields | "description", string>>;
interface SourcedRequest { sessionId: string; mandate: ProcurementMandate; quotes: VendorQuote[]; evaluations: Record<string, QuoteEvaluation> }
const editableStates = new Set(["SOURCING", "MANDATE_PENDING"]);

function initialFields(session?: ProcurementSession): Fields {
  const m = session?.mandate;
  return { itemQuery: m?.itemQuery ?? "", quantity: m ? String(m.quantity) : "", budget: m ? String(m.maxTotalBudget) : "", delivery: m ? String(m.maxDeliveryDays) : "", returns: m ? String(m.minReturnDays) : "", currency: m?.currency ?? "USD" };
}
function validate(fields: Fields): Errors {
  const errors: Errors = {};
  if (!fields.itemQuery.trim()) errors.itemQuery = "Describe the product you need.";
  if (!/^\d+$/.test(fields.quantity) || !Number.isSafeInteger(Number(fields.quantity)) || Number(fields.quantity) < 1) errors.quantity = "Enter a whole number of units, at least 1.";
  if (!/^\d+(\.\d{1,2})?$/.test(fields.budget) || Number(fields.budget) <= 0 || !Number.isSafeInteger(toMinorUnits(Number(fields.budget)))) errors.budget = "Enter a positive budget with up to two decimal places.";
  if (!/^\d+$/.test(fields.delivery) || !Number.isSafeInteger(Number(fields.delivery)) || Number(fields.delivery) < 1) errors.delivery = "Enter a whole number of days, at least 1.";
  if (!/^\d+$/.test(fields.returns) || !Number.isSafeInteger(Number(fields.returns))) errors.returns = "Enter a whole number of days, 0 or more.";
  return errors;
}
function errorMessage(data: { error?: string | { message?: string } }, fallback: string) {
  return typeof data.error === "string" ? data.error : data.error?.message || fallback;
}

export function SourcingScreen({ onStartNegotiation, onSessionCreated, session, isLoading = false }: SourcingScreenProps) {
  const organization = useOrganization();
  const allowed = Boolean(organization?.permissions.includes("session.write"));
  const canNegotiate = Boolean(organization?.permissions.includes("negotiation.start"));
  const [fields, setFields] = useState<Fields>(() => initialFields(session));
  const [description, setDescription] = useState("");
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [analysisBlocked, setAnalysisBlocked] = useState(false);
  const [requirements, setRequirements] = useState(() => ({ requiredSpecs: session?.mandate.requiredSpecs ?? [], requiredCondition: session?.mandate.requiredCondition ?? "NEW" as const }));
  const [result, setResult] = useState<SourcedRequest | null>(() => session && editableStates.has(session.status) ? { sessionId: session.id, mandate: session.mandate, quotes: session.quotes ?? [], evaluations: session.quoteEvaluations ?? {} } : null);
  const [pending, setPending] = useState<"analysis" | "source" | "negotiation" | null>(null);
  const requestActive = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const requestIdentity = useRef<{ payload: string; key: string } | null>(null);
  const firstInput = useRef<HTMLFormElement>(null);
  const busy = pending !== null || isLoading;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [organization?.id]);

  function change(name: keyof Fields, value: string) {
    if (requestActive.current || isLoading) return;
    setFields(previous => ({ ...previous, [name]: value }));
    setResult(null);
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setAnalysisBlocked(false);
    setQuestions([]);
    setMessage("");
  }
  function validateAndFocus() {
    const next = validate(fields);
    setErrors(next);
    if (Object.keys(next).length) {
      const name = Object.keys(next)[0];
      firstInput.current?.querySelector<HTMLElement>(`[id="sourcing-${name}"]`)?.focus();
      return false;
    }
    return true;
  }
  function rawMandate(): Partial<ProcurementMandate> {
    return { itemQuery: fields.itemQuery.trim(), quantity: Number(fields.quantity), maxTotalBudget: Number(fields.budget), maxDeliveryDays: Number(fields.delivery), minReturnDays: Number(fields.returns), currency: fields.currency, ...requirements };
  }
  function synchronizedPrompt() {
    return `Purchase ${fields.quantity} ${fields.itemQuery.trim()} with a total budget of ${fields.currency} ${fields.budget}, delivery within ${fields.delivery} days and a minimum ${fields.returns}-day return window.`;
  }
  async function request(kind: "analysis" | "source") {
    if (!allowed || requestActive.current || isLoading) return;
    if (kind === "analysis" && !description.trim()) { setErrors({ description: "Enter a written request to extract." }); return; }
    if (kind === "source" && (!validateAndFocus() || descriptionDirty || analysisBlocked || result)) return;
    requestActive.current = true;
    setPending(kind);
    setMessage("");
    setQuestions([]);
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 45000);
    try {
      const payload = JSON.stringify(kind === "analysis" ? { prompt: description.trim(), currency: fields.currency, analyzeOnly: true } : { prompt: synchronizedPrompt(), currency: fields.currency, rawMandate: rawMandate() });
      if (kind === "source" && requestIdentity.current?.payload !== payload) requestIdentity.current = { payload, key: crypto.randomUUID() };
      const response = await fetch("/api/procurement/init", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(kind === "source" ? { "Idempotency-Key": requestIdentity.current!.key } : {}) },
        body: payload, signal: controller.current.signal,
      });
      const data = await response.json().catch(() => { throw new Error("The server returned an unreadable response. Please try again."); });
      if (!mounted.current) return;
      if (!response.ok) throw new Error(errorMessage(data, "The request could not be completed. Please try again."));
      if (kind === "analysis") {
        if (!["READY", "NEEDS_CLARIFICATION", "INVALID"].includes(data.status)) throw new Error("The extracted requirements could not be read. Complete the fields manually or try again.");
        const extracted = data.mandate ?? data;
        setFields(previous => ({
          itemQuery: typeof extracted.itemQuery === "string" ? extracted.itemQuery : previous.itemQuery,
          quantity: extracted.quantity != null ? String(extracted.quantity) : previous.quantity,
          budget: extracted.maxTotalBudget != null ? String(extracted.maxTotalBudget) : previous.budget,
          delivery: extracted.maxDeliveryDays != null ? String(extracted.maxDeliveryDays) : previous.delivery,
          returns: extracted.minReturnDays != null ? String(extracted.minReturnDays) : previous.returns,
          currency: INTERNAL_SUPPORTED_CURRENCIES.includes(extracted.currency) ? extracted.currency : previous.currency,
        }));
        if (Array.isArray(extracted.requiredSpecs)) setRequirements(previous => ({ ...previous, requiredSpecs: extracted.requiredSpecs }));
        setQuestions([...(data.contradictions ?? []), ...(data.clarificationQuestions ?? [])]);
        setAnalysisBlocked(data.status === "INVALID");
        setDescriptionDirty(false);
        setErrors({});
        if (data.status === "INVALID") setMessage("The written request contains conflicting requirements. Review and correct the fields below.");
        else if (data.status === "NEEDS_CLARIFICATION" && !data.clarificationQuestions?.length) setQuestions(["Complete the missing requirements below before finding suppliers."]);
      } else {
        if (typeof data.sessionId !== "string" || !data.sessionId || !data.mandate || !Array.isArray(data.quotes)) throw new Error("The saved request could not be confirmed. Retry with the same requirements to recover it safely.");
        setResult({ sessionId: data.sessionId, mandate: data.mandate, quotes: data.quotes, evaluations: data.evaluations ?? {} });
        onSessionCreated?.(data.sessionId);
      }
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error && error.name !== "AbortError" ? error.message : "The request timed out. Try again; the same submission identity will be reused.");
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setPending(null);
      requestActive.current = false;
    }
  }
  const candidates = result?.quotes.filter(quote => evaluateNegotiationCandidate(result.mandate, quote, result.evaluations[quote.vendorId]).isCandidate) ?? [];
  async function startNegotiation() {
    if (!allowed || !canNegotiate || !result || !candidates.length || requestActive.current || isLoading) return;
    requestActive.current = true;
    setPending("negotiation");
    setMessage("");
    try { await onStartNegotiation(result.mandate.rawPrompt, result.mandate.currency ?? fields.currency, result.mandate, result.sessionId); }
    catch { if (mounted.current) setMessage("Negotiation could not be opened. Your saved procurement request is unchanged."); }
    finally { if (mounted.current) setPending(null); requestActive.current = false; }
  }

  if (!allowed) return <OperationsPanel title="Sourcing"><DataMessage title="Procurement access required">An active organization membership with procurement permission is required.</DataMessage></OperationsPanel>;
  if (session && !editableStates.has(session.status)) return <OperationsPanel title="Procurement request"><DataMessage title="This request is no longer in sourcing">Open the record from History to continue at its current stage.</DataMessage></OperationsPanel>;

  return <div className="space-y-6">
    <header className="space-y-3"><h1 className="workspace-title">Source a procurement request</h1><p className="text-sm text-text-secondary">Define your requirements, compare available offers and begin negotiation.</p></header>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <OperationsPanel title="Requirements">
        <form noValidate aria-label="Procurement requirements" onSubmit={event => { event.preventDefault(); void request("source"); }} className="pb-6 space-y-6" ref={firstInput}>
          <p className="text-xs text-text-secondary">Complete every field below. Finding suppliers saves a procurement request for this organization.</p>
          <details className="border-b border-border-primary pb-5">
            <summary className="font-medium text-sm rounded focus-visible:outline-2 focus-visible:outline-ember-orange">Use a written request (optional)</summary>
            <div className="mt-4 space-y-3">
              <label htmlFor="sourcing-description" className="block text-sm font-medium">Written request</label>
              <textarea id="sourcing-description" rows={3} value={description} disabled={busy} aria-invalid={Boolean(errors.description)} aria-describedby="sourcing-description-help sourcing-description-error" onChange={event => { setDescription(event.target.value); setDescriptionDirty(Boolean(event.target.value.trim())); setResult(null); setMessage(""); setErrors({}); }} className="w-full rounded-[6px] border border-border-primary bg-surface-primary p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ember-orange disabled:opacity-50" />
              <p id="sourcing-description-help" className="text-xs leading-relaxed text-text-secondary">Extract this text to fill the fields below, then review the values. Only the reviewed fields are submitted.</p>
              <p id="sourcing-description-error" className="text-sm text-red-700 dark:text-red-300">{errors.description}</p>
              <div className="flex flex-wrap gap-3"><GhostButton onClick={() => void request("analysis")} disabled={busy || !description.trim()}>{pending === "analysis" ? "Extracting requirements…" : "Extract requirements"}</GhostButton><GhostButton disabled={busy || !description} onClick={() => { setDescription(""); setDescriptionDirty(false); setErrors({}); setAnalysisBlocked(false); setQuestions([]); setMessage(""); }}>Discard text</GhostButton></div>
            </div>
          </details>
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <legend className="mb-4 font-medium">Product and budget</legend>
            <FormInput required id="sourcing-itemQuery" label="Product description" value={fields.itemQuery} onChange={event => change("itemQuery", event.target.value)} error={errors.itemQuery} placeholder="Product type and essential specifications" />
            <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_112px] gap-4"><FormInput required id="sourcing-quantity" label="Quantity (units)" type="number" min={1} value={fields.quantity} onChange={event => change("quantity", event.target.value)} error={errors.quantity} />
              <FormInput required id="sourcing-budget" label={`Total budget (${fields.currency})`} type="number" min="0.01" step="0.01" value={fields.budget} onChange={event => change("budget", event.target.value)} error={errors.budget} />
              <div className="space-y-1.5"><label htmlFor="sourcing-currency" className="block type-form-label">Commercial currency</label><select required id="sourcing-currency" value={fields.currency} onChange={event => change("currency", event.target.value)} aria-describedby="sourcing-currency-help" className="w-full h-10 rounded-[6px] border border-border-primary bg-surface-primary px-3 text-sm focus-visible:outline-2 focus-visible:outline-ember-orange">{INTERNAL_SUPPORTED_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</select></div></div>
            <p id="sourcing-currency-help" className="text-xs leading-relaxed text-text-secondary">The total budget includes shipping. Changing currency does not convert your amount.</p>
          </fieldset>
          <fieldset disabled={busy} className="min-w-0 border-t border-border-primary pt-5 space-y-4"><legend className="font-medium pt-5">Delivery and returns</legend>
            <div className="grid sm:grid-cols-2 gap-4"><FormInput required id="sourcing-delivery" label="Maximum delivery (days)" type="number" min={1} value={fields.delivery} onChange={event => change("delivery", event.target.value)} error={errors.delivery} /><FormInput required id="sourcing-returns" label="Minimum return window (days)" type="number" min={0} value={fields.returns} onChange={event => change("returns", event.target.value)} error={errors.returns} /></div>
            <p className="text-xs leading-relaxed text-text-secondary">These limits are required. Enter 0 only if no return window is required. Product condition: {requirements.requiredCondition.toLowerCase()}.</p>
            {requirements.requiredSpecs.length > 0 && <ul className="text-sm space-y-1">{requirements.requiredSpecs.map((spec, index) => <li key={index}>{spec.name}: {spec.value} ({spec.mandatory ? "required" : "preferred"})</li>)}</ul>}
          </fieldset>
          {questions.length > 0 && <div role="status" className="space-y-2 border-l-2 border-border-primary pl-4 text-sm"><p className="font-medium">Review extracted requirements</p><ul className="list-disc pl-4 space-y-1">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
          {descriptionDirty && <p role="status" className="text-sm text-text-secondary">Extract or discard the written request before finding suppliers.</p>}
          {message && <p role="alert" className="rounded-[6px] border border-red-300 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200">{message}</p>}
          {pending && <p role="status" className="text-sm text-text-secondary">{pending === "source" ? "Finding suppliers and saving your request…" : pending === "analysis" ? "Reading your written request…" : "Opening negotiation…"}</p>}
          {result ? <p role="status" className="text-sm">Request saved. Edit a requirement to start a new search.</p> : <PrimaryButton type="submit" disabled={busy || descriptionDirty || analysisBlocked}>{pending === "source" ? "Finding suppliers…" : message && pending !== "analysis" ? "Try finding suppliers again" : "Find suppliers"}</PrimaryButton>}
        </form>
      </OperationsPanel>
      <aside aria-label="Request review" className="min-w-0"><OperationsPanel title="Request review"><dl className="pb-5 space-y-4 text-sm">
        <div><dt className="text-text-secondary">Product</dt><dd className="mt-1 font-medium break-words">{fields.itemQuery.trim() || "Not specified"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-secondary">Quantity</dt><dd className="font-mono-token tabular-nums">{fields.quantity || "Not specified"}</dd></div>
        <div><dt className="text-text-secondary">Total budget</dt><dd className="mt-1 break-words">{!validate(fields).budget ? <><CurrencyDisplay amount={Number(fields.budget)} currency={fields.currency} /> <span className="text-xs text-text-secondary">{fields.currency}</span></> : "Not specified"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-secondary">Delivery within</dt><dd>{fields.delivery ? `${fields.delivery} days` : "Not specified"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-secondary">Returns at least</dt><dd>{fields.returns !== "" ? `${fields.returns} days` : "Not specified"}</dd></div>
      </dl><p className="border-t border-border-primary py-4 text-xs leading-relaxed text-text-secondary">Supplier asking prices may exceed the budget while negotiating. Final agreed terms must satisfy the budget and required constraints.</p></OperationsPanel></aside>
    </div>
    <OperationsPanel title="Supplier comparison">
      {pending === "source" ? <DataMessage title="Finding available suppliers…">Quotes and constraint checks will appear here.</DataMessage> : !result ? <DataMessage title="No supplier search yet">Complete your requirements and select Find suppliers to save the request and retrieve available quotes.</DataMessage> : result.quotes.length === 0 ? <DataMessage title="No suppliers returned">No quotes were returned for this product and currency. Edit your requirements to search again.</DataMessage> : <>
        <div className="px-5 py-4 space-y-1 text-sm"><p>{result.quotes.length} supplier offers. {candidates.length} eligible to participate in negotiation.</p><p className="text-text-secondary">Negotiation includes all eligible suppliers shown below.</p>{result.quotes.some(quote => quote.dataSource === "MOCK_CATALOG") && <p className="text-text-secondary">Demonstration catalog: sample supplier quotes, not live commercial offers.</p>}<p className="sm:hidden text-xs text-text-secondary">Scroll the comparison horizontally to see all prices and eligibility checks.</p></div>
        <LedgerTable label="Available supplier offers"><thead><tr><th scope="col">Supplier and product</th><th scope="col">Delivery / returns</th><th scope="col" className="text-right">Asking price</th><th scope="col" className="text-right">Total incl. shipping</th><th scope="col">Negotiation eligibility</th></tr></thead><tbody>{result.quotes.map(quote => {
          const evaluation = result.evaluations[quote.vendorId];
          const candidate = evaluateNegotiationCandidate(result.mandate, quote, evaluation);
          const quoteCurrency = quote.currency ?? "USD";
          return <tr key={quote.vendorId}><th scope="row" className="font-normal"><span className="block max-w-[300px] truncate font-medium" title={quote.vendorName}>{quote.vendorName}</span><span className="mt-1 block max-w-[300px] text-xs leading-relaxed text-text-secondary break-words">{quote.productTitle}</span><span className="mt-2 block text-xs text-text-secondary">{quote.dataSource === "MOCK_CATALOG" ? "Demonstration quote" : quote.dataSource === "CHANNEL3" ? "Channel3 quote" : "Source not specified"}</span></th><td className="whitespace-nowrap">{quote.deliveryDays} days delivery<br /><span className="text-text-secondary">{quote.returnDays} days returns</span></td><td className="text-right whitespace-nowrap"><CurrencyDisplay amount={quote.initialUnitAsk} currency={quoteCurrency} size="sm" /><span className="block mt-1 text-xs text-text-secondary">per unit · {quoteCurrency}</span><span className="block text-xs text-text-secondary">Shipping <CurrencyDisplay amount={quote.shippingCost} currency={quoteCurrency} size="sm" /></span></td><td className="text-right whitespace-nowrap">{evaluation ? <CurrencyDisplay amount={evaluation.financials.landedCost} currency={quoteCurrency} size="sm" /> : "Not evaluated"}</td><td><p className="font-medium">{candidate.isCandidate ? candidate.isAboveBudgetBaseline ? "Above budget; negotiable" : "Eligible" : "Not eligible"}</p>{candidate.hardDisqualificationReasons.length > 0 && <ul className="mt-2 max-w-[260px] list-disc pl-4 text-xs leading-relaxed text-text-secondary">{candidate.hardDisqualificationReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}</td></tr>;
        })}</tbody></LedgerTable>
      </>}
      {result && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border-primary p-5"><div className="text-sm text-text-secondary max-w-2xl">{!candidates.length ? "Negotiation is unavailable until at least one supplier meets the required constraints." : "Start negotiation using this saved request and its eligible suppliers. This does not authorize or capture a payment."}{!canNegotiate && <p>You do not have permission to start negotiation.</p>}</div><PrimaryButton onClick={() => void startNegotiation()} disabled={busy || !canNegotiate || !candidates.length}>{pending === "negotiation" ? "Opening negotiation…" : "Start negotiation"}</PrimaryButton></div>}
    </OperationsPanel>
  </div>;
}
