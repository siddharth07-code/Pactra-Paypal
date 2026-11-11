import "server-only";

const publicCodes = new Set(["invalid_credentials", "email_not_confirmed", "weak_password", "user_already_exists", "email_exists", "user_not_found", "email_not_found", "refresh_token_not_found", "refresh_token_already_used", "session_not_found", "otp_expired"]);

/** Auth SDKs may log provider errors during refresh. Never pass reflected secrets to them. */
export async function authProviderFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let stage = "transport";
  let status: number | undefined;
  const endpoint = (() => { try { const path = new URL(input instanceof Request ? input.url : String(input)).pathname; return path.endsWith("/.well-known/jwks.json") ? "jwks" : path.endsWith("/user") ? "user" : path.endsWith("/token") ? "token" : "other"; } catch { return "other"; } })();
  const diagnostic = (reason: string) => { if (process.env.VERCEL === "1") console.error("[AuthProvider] request failed", JSON.stringify({ endpoint, stage, status, reason })); };
  try {
    const response = await fetch(input, {
      ...init, redirect: "error", cache: "no-store",
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
    status = response.status;
    if (response.ok) {
      if (response.status === 204) return response;
      // Reject malformed success bodies before the SDK can log a parser error containing tokens.
      stage = "response_format";
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !response.body) throw new Error();
      stage = "response_body";
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) throw new Error();
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
        return Response.json(data, { status: response.status });
      } finally { void reader.cancel().catch(() => undefined); }
    }
    stage = "upstream_status";
    let code: string | undefined;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        let text = "";
        let size = 0;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) break;
          text += decoder.decode(value, { stream: true });
        }
        const parsed = JSON.parse(text + decoder.decode()) as { code?: string; error_code?: string };
        const value = parsed.code ?? parsed.error_code;
        if (value && publicCodes.has(value)) code = value;
      } catch { /* Provider diagnostics are intentionally discarded. */ }
      finally { void reader.cancel().catch(() => undefined); }
    }
    diagnostic(code ?? "UPSTREAM_REJECTED");
    return Response.json({ code, error_code: code, msg: "Authentication provider rejected the request." }, { status: response.status >= 400 ? response.status : 503 });
  } catch (error) {
    const cause = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause ? String(error.cause.code) : "";
    const reason = /^(?:CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_TLS_CERT_ALTNAME_INVALID|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT)$/.test(cause) ? cause : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? error.name : "INVALID_PROVIDER_RESPONSE";
    diagnostic(reason);
    // Some SDK paths log transport errors; return only a sanitized retryable failure.
    return Response.json({ msg: "Authentication provider is temporarily unavailable." }, { status: 503 });
  }
}
