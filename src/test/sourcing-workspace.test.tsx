import { ScrollTrigger } from "gsap/ScrollTrigger";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SourcingScreen } from "@/components/SourcingScreen";
import type { ProcurementSession, ProcurementMandate, VendorQuote } from "@/types/pactum";
const context = vi.hoisted(() => ({ organization: { id: "organization-a", name: "Procurement team", role: "OWNER", permissions: ["session.write", "negotiation.start"] } as { id: string; name: string; role: string; permissions: string[] } | null }));
vi.mock("@/components/OrganizationBoundary", () => ({ useOrganization: () => context.organization }));
const mandate: ProcurementMandate = { id: "mandate-a", itemQuery: "USB-C monitors", quantity: 25, maxTotalBudget: 8500.25, currency: "USD", maxDeliveryDays: 5, minReturnDays: 30, rawPrompt: "Reviewed monitor procurement", requiredSpecs: [], requiredCondition: "NEW", createdAt: "2026-11-01T00:00:00Z" };
const quote: VendorQuote = { vendorId: "supplier-a", vendorName: "Test supplier with a long legal company name", sku: "TEST-MONITOR", productTitle: "USB-C monitor", initialUnitAsk: 375, currentUnitBid: 375, shippingCost: 150, deliveryDays: 4, returnDays: 30, currency: "USD", condition: "NEW", status: "ACTIVE", dataSource: "MOCK_CATALOG" };
function success(quotes = [quote]) { return Response.json({ sessionId: "session-a", mandate, quotes, evaluations: {} }); }
function fill() {
  for (const [label, value] of [["Product description", "USB-C monitors"], ["Quantity (units)", "25"], ["Total budget (USD)", "8500.25"], ["Maximum delivery (days)", "5"], ["Minimum return window (days)", "30"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function renderWorkspace(props: Partial<React.ComponentProps<typeof SourcingScreen>> = {}) { return render(<SourcingScreen onStartNegotiation={vi.fn()} {...props} />); }
beforeEach(() => { context.organization = { id: "organization-a", name: "Procurement team", role: "OWNER", permissions: ["session.write", "negotiation.start"] }; vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); ScrollTrigger.killAll(); ScrollTrigger.disable(); vi.unstubAllGlobals(); });

describe("Sourcing procurement workspace", () => {
  it("starts without assumed product, quantity or financial values", () => {
    renderWorkspace();
    expect(screen.getByLabelText("Product description")).toHaveValue("");
    expect(screen.getByLabelText("Quantity (units)")).toHaveValue(null);
    expect(screen.getByLabelText("Quantity (units)")).toBeRequired();
    expect(screen.getByLabelText("Total budget (USD)")).toHaveValue(null);
    expect(screen.getByText("No supplier search yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find suppliers" })).toHaveAttribute("type", "submit");
  });
  it("validates required fields, focuses the first error and never submits invalid values", () => {
    renderWorkspace(); fireEvent.submit(screen.getByRole("form", { name: "Procurement requirements" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Product description")).toHaveFocus();
    expect(screen.getByLabelText("Product description")).toHaveAttribute("aria-invalid", "true");
    fill(); fireEvent.change(screen.getByLabelText("Quantity (units)"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
    expect(screen.getByText("Enter a whole number of units, at least 1.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects excess monetary precision and unsafe quantities", () => {
    renderWorkspace(); fill();
    fireEvent.change(screen.getByLabelText("Total budget (USD)"), { target: { value: "10.001" } });
    fireEvent.change(screen.getByLabelText("Quantity (units)"), { target: { value: "9007199254740992" } });
    fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
    expect(fetch).not.toHaveBeenCalled(); expect(screen.getByText(/positive budget with up to two decimal/)).toBeInTheDocument();
  });
  it("does not alter the amount when changing commercial currency", () => {
    renderWorkspace(); fill(); fireEvent.change(screen.getByLabelText("Commercial currency"), { target: { value: "INR" } });
    expect(screen.getByLabelText("Total budget (INR)")).toHaveValue(8500.25);
  });
  it("reads the actual flat extraction response, including a zero return window", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ status: "READY", itemQuery: "Servers", quantity: 2, maxTotalBudget: 10000, maxDeliveryDays: 3, minReturnDays: 0, currency: "INR" }));
    renderWorkspace(); fireEvent.click(screen.getByText("Use a written request (optional)"));
    fireEvent.change(screen.getByLabelText("Written request"), { target: { value: "Two servers, INR 10000, three days, no returns" } });
    fireEvent.click(screen.getByRole("button", { name: "Extract requirements" }));
    await waitFor(() => expect(screen.getByLabelText("Product description")).toHaveValue("Servers"));
    expect(screen.getByLabelText("Minimum return window (days)")).toHaveValue(0);
    expect(screen.getByLabelText("Total budget (INR)")).toHaveValue(10000);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).analyzeOnly).toBe(true);
  });
  it("handles clarification and invalid extraction without inventing missing values", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ status: "INVALID", contradictions: ["Delivery limits conflict"], clarificationQuestions: ["Which delivery deadline applies?"] }));
    renderWorkspace(); fireEvent.click(screen.getByText("Use a written request (optional)"));
    fireEvent.change(screen.getByLabelText("Written request"), { target: { value: "conflicting request" } });
    fireEvent.click(screen.getByRole("button", { name: "Extract requirements" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("conflicting requirements");
    expect(screen.getByRole("button", { name: /finding suppliers|Find suppliers/ })).toBeDisabled();
    expect(screen.getByLabelText("Total budget (USD)")).toHaveValue(null);
  });
  it("persists once under concurrent clicks and hands off the exact saved session", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(r => { resolve = r; }));
    const start = vi.fn(); const created = vi.fn(); renderWorkspace({ onStartNegotiation: start, onSessionCreated: created }); fill();
    const button = screen.getByRole("button", { name: "Find suppliers" });
    fireEvent.click(button); fireEvent.submit(screen.getByRole("form", { name: "Procurement requirements" }));
    expect(fetch).toHaveBeenCalledOnce(); expect(screen.getByText("Finding suppliers and saving your request…")).toBeInTheDocument();
    expect(screen.getByLabelText("Product description")).toBeDisabled();
    await act(async () => resolve(success()));
    expect(created).toHaveBeenCalledWith("session-a");
    expect(screen.getByText(/Demonstration catalog:/)).toBeInTheDocument();
    expect(screen.getByText("Above budget; negotiable")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start negotiation" })));
    expect(start).toHaveBeenCalledWith(mandate.rawPrompt, "USD", mandate, "session-a");
    expect((vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string,string>)["Idempotency-Key"]).toBeTruthy();
  });
  it("reuses the idempotency identity after a network failure and does not trust organization IDs from form data", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce(success());
    renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
    fireEvent.click(screen.getByRole("button", { name: "Try finding suppliers again" }));
    await screen.findByRole("table");
    const [a,b] = vi.mocked(fetch).mock.calls.map(call => call[1]!);
    expect(a.headers).toEqual(b.headers); expect(a.body).toEqual(b.body);
    expect(a.credentials).toBe("same-origin"); expect(a.body).not.toContain("organizationId");
  });
  it("invalidates quotes and session binding after a requirement or description edit", async () => {
    vi.mocked(fetch).mockImplementation(async () => success()); renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" })); await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Quantity (units)"), { target: { value: "26" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Start negotiation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find suppliers" })); await screen.findByRole("table");
    fireEvent.click(screen.getByText("Use a written request (optional)")); fireEvent.change(screen.getByLabelText("Written request"), { target: { value: "New requirements" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Find suppliers" })).toBeDisabled();
  });
  it("shows a real empty supplier result and blocks negotiation", async () => {
    vi.mocked(fetch).mockResolvedValue(success([])); renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
    expect(await screen.findByText("No suppliers returned")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Start negotiation" })).toBeDisabled();
  });
  it("does not negotiate suppliers failing mandatory delivery or currency requirements", async () => {
    vi.mocked(fetch).mockResolvedValue(success([{ ...quote, deliveryDays: 20, currency: "INR" }])); renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" })); await screen.findByRole("table");
    expect(screen.getByText("Not eligible")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Start negotiation" })).toBeDisabled();
  });
  it("hydrates an existing sourcing record and does not recreate it", () => {
    renderWorkspace({ session: { id: "session-a", status: "SOURCING", mandate, quotes: [quote] } as ProcurementSession });
    expect(screen.getByLabelText("Total budget (USD)")).toHaveValue(8500.25); expect(screen.getByRole("table")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed without organization procurement permission and protects terminal records", () => {
    context.organization = null; const { rerender } = renderWorkspace(); expect(screen.queryByRole("form")).not.toBeInTheDocument();
    context.organization = { id: "organization-b", name: "Finance", role: "FINANCE_MANAGER", permissions: ["session.read"] }; rerender(<SourcingScreen onStartNegotiation={vi.fn()} />); expect(screen.queryByRole("form")).not.toBeInTheDocument();
    context.organization.permissions.push("session.write"); rerender(<SourcingScreen onStartNegotiation={vi.fn()} session={{ id: "cancelled", status: "CANCELLED", mandate, quotes: [quote] } as ProcurementSession} />); expect(screen.getByText("This request is no longer in sourcing")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
  it("aborts in-flight work when leaving the organization workspace", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); const { unmount } = renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!; unmount(); expect(signal.aborted).toBe(true);
  });
  it("fails closed on an unconfirmed saved response", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ quotes: [quote] })); renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" })); expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed"); expect(screen.queryByRole("button", { name: "Start negotiation" })).not.toBeInTheDocument();
  });
  it("blocks a duplicate negotiation handoff while the first callback is pending", async () => {
    let finish!: () => void;
    const start = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    renderWorkspace({ onStartNegotiation: start, session: { id: "session-a", status: "SOURCING", mandate, quotes: [quote] } as ProcurementSession });
    const button = screen.getByRole("button", { name: "Start negotiation" });
    fireEvent.click(button); fireEvent.click(button);
    expect(start).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
    await act(async () => finish());
  });
  it("requires negotiation permission independently from request creation permission", () => {
    context.organization!.permissions = ["session.write"];
    const start = vi.fn();
    renderWorkspace({ onStartNegotiation: start, session: { id: "session-a", status: "SOURCING", mandate, quotes: [quote] } as ProcurementSession });
    fireEvent.click(screen.getByRole("button", { name: "Start negotiation" }));
    expect(start).not.toHaveBeenCalled(); expect(screen.getByText("You do not have permission to start negotiation.")).toBeInTheDocument();
  });
  it("renders structured authorization errors without presenting a supplier success", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: { code: "PERMISSION_DENIED", message: "Your membership no longer permits this action." } }, { status: 403 }));
    renderWorkspace(); fill(); fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your membership no longer permits this action.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

it("preserves manual product details and reference price without turning them into supplier terms", async () => {
  vi.mocked(fetch).mockResolvedValue(success());
  renderWorkspace(); fill();
  fireEvent.change(screen.getByLabelText("Additional product details"), { target: { value: "Model ZX, office use" } });
  fireEvent.change(screen.getByLabelText("Product category (optional)"), { target: { value: "monitors" } });
  fireEvent.change(screen.getByLabelText("Reference unit price (USD, optional)"), { target: { value: "300.25" } });
  fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(body.rawMandate.productDetails).toEqual({ description: "Model ZX, office use", category: "monitors", referenceUnitPrice: 300.25, currency: "USD" });
  expect(body.rawMandate.maxTotalBudget).toBe(8500.25);
});

it("rejects malformed reference prices before sending a sourcing request", () => {
  renderWorkspace(); fill();
  fireEvent.change(screen.getByLabelText("Reference unit price (USD, optional)"), { target: { value: "1.005" } });
  fireEvent.submit(screen.getByRole("form", { name: "Procurement requirements" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(/Enter a positive reference unit price/)).toBeInTheDocument();
});

it("clears the reference price on currency changes instead of relabelling buyer money", () => {
  renderWorkspace(); fill();
  fireEvent.change(screen.getByLabelText("Reference unit price (USD, optional)"), { target: { value: "300.25" } });
  fireEvent.change(screen.getByLabelText("Commercial currency"), { target: { value: "INR" } });
  expect(screen.getByLabelText("Reference unit price (INR, optional)")).toHaveValue(null);
  expect(screen.getByLabelText("Quantity (units)")).toHaveValue(25);
});

it("copies a catalog selection without changing quantity, spending ceiling or inventing supplier terms", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ sessionId: "catalog-session", mandate, quotes: [], catalogProducts: [{ id: "catalog-product", title: "Selected monitor", merchant: "merchant.example", unitPrice: 321.25, currency: "USD", url: "https://merchant.example/product" }], warning: "Merchant terms require verification." }));
  renderWorkspace(); fill();
  fireEvent.click(screen.getByRole("button", { name: "Find suppliers" }));
  fireEvent.click(await screen.findByRole("button", { name: "Use product in request" }));
  expect(screen.getByLabelText("Product description")).toHaveValue("Selected monitor");
  expect(screen.getByLabelText("Reference unit price (USD, optional)")).toHaveValue(321.25);
  expect(screen.getByLabelText("Quantity (units)")).toHaveValue(25);
  expect(screen.getByLabelText("Total budget (USD)")).toHaveValue(8500.25);
  expect(screen.getByText(/merchant terms and supplier acceptance remain unverified/)).toBeInTheDocument();
});
