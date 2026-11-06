import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, authConfiguration } from "./config";

export function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Vary", "Cookie, Origin");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function authFailure(error: unknown): NextResponse {
  const failure = error instanceof AuthError ? error :
    new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication provider is temporarily unavailable.");
  const response = NextResponse.json({ success: false, error: { code: failure.code, message: failure.message } }, { status: failure.status });
  if (failure.status === 503 || failure.status === 429) response.headers.set("Retry-After", "10");
  return privateResponse(response);
}

export function requireSameOrigin(request: NextRequest): void {
  const { origin } = authConfiguration();
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthError(403, "AUTH_INVALID_ORIGIN", "A same-origin request is required.");
  }
}

export async function boundedJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AuthError(415, "AUTH_CONTENT_TYPE", "Content-Type must be application/json.");
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new AuthError(413, "AUTH_BODY_TOO_LARGE", "Authentication request exceeds 4096 bytes.");
  }
  if (!request.body) throw new AuthError(400, "AUTH_INVALID_BODY", "A JSON object is required.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const read = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new AuthError(413, "AUTH_BODY_TOO_LARGE", "Request exceeds its allowed size.");
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
      return body as Record<string, unknown>;
    };
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AuthError(408, "AUTH_BODY_TIMEOUT", "Authentication request timed out.")), 5000);
    })]);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(400, "AUTH_INVALID_BODY", "A valid JSON object is required.");
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

export function credentials(body: Record<string, unknown>, registration: boolean) {
  const { email, password } = body;
  if (Object.keys(body).some(key => !["email", "password", "next"].includes(key)) ||
    typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" || password.length < (registration ? 12 : 1) || password.length > 128) {
    throw new AuthError(400, "AUTH_INVALID_INPUT", "Provide a valid email and password (registration requires 12–128 characters).");
  }
  return { email: email.trim().toLowerCase(), password };
}
