export function negotiationFailureCode(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  const codes = ["STALE_VERSION", "DATABASE_UNAVAILABLE", "DATABASE_CONFLICT", "DATABASE_CONSTRAINT", "EVIDENCE_IMMUTABLE", "EVIDENCE_INTEGRITY", "MANDATE_IMMUTABLE", "AGREEMENT_BINDING", "PERMISSION_DENIED", "RATE_LIMIT_EXCEEDED", "REQUEST_TIMEOUT", "API_REQUEST_FAILED"];
  if (value?.code && codes.includes(value.code)) return value.code;
  if (value?.message?.startsWith("Monetary value")) return "MONETARY_REPRESENTATION_INVALID";
  if (value?.message === "Negotiation connection closed.") return "STREAM_INTERRUPTED";
  return "NEGOTIATION_UNEXPECTED";
}
export function negotiationFailureMessage(code: string): string {
  if (code === "AUTH_REQUIRED") return "Your sign-in session could not be verified. Reload this page to sign in again.";
  if (code === "PERMISSION_DENIED") return "Your organization membership does not permit this negotiation. Reload the session to verify your access.";
  if (code === "SERVICE_UNAVAILABLE") return "Negotiation services are unavailable. Reload the saved session before trying again.";
  if (code === "MONETARY_REPRESENTATION_INVALID") return "Negotiation stopped because an amount could not be committed exactly. No completion was confirmed.";
  if (["DATABASE_UNAVAILABLE", "DATABASE_CONFLICT", "DATABASE_CONSTRAINT"].includes(code)) return "Negotiation could not save its progress. Reload the session to check the last committed state before retrying.";
  if (["REQUEST_TIMEOUT", "RATE_LIMIT_EXCEEDED", "API_REQUEST_FAILED"].includes(code)) return "The negotiation provider could not complete the request. Reload the session and try again when the provider is available.";
  if (code === "STALE_VERSION") return "This session changed while negotiation was running. Reload it before continuing.";
  if (code === "STREAM_INTERRUPTED") return "The connection ended before a final result was received. Reload the session to check its saved state.";
  return "Negotiation stopped unexpectedly. Reload the session to review the last committed progress. No successful completion has been confirmed.";
}
export class NegotiationRunError extends Error {
  historySaved = false;
  constructor(public readonly code: string, public readonly reference: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Negotiation failed unexpectedly.", { cause });
    this.name = "NegotiationRunError";
  }
}
