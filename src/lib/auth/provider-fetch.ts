import "server-only";

const publicCodes = new Set(["invalid_credentials", "email_not_confirmed", "weak_password", "user_already_exists", "email_exists", "refresh_token_not_found", "refresh_token_already_used", "session_not_found", "otp_expired"]);

/** Auth SDKs may log provider errors during refresh. Never pass reflected secrets to them. */
export async function authProviderFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, {
      ...init, redirect: "error", cache: "no-store",
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
    if (response.ok) {
      if (response.status === 204) return response;
      // Reject malformed success bodies before the SDK can log a parser error containing tokens.
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !response.body) throw new Error();
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
    return Response.json({ code, error_code: code, msg: "Authentication provider rejected the request." }, { status: response.status >= 400 ? response.status : 503 });
  } catch {
    // Some SDK paths log transport errors; return only a sanitized retryable failure.
    return Response.json({ msg: "Authentication provider is temporarily unavailable." }, { status: 503 });
  }
}
