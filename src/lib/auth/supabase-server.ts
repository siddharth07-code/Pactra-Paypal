import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authConfiguration } from "./config";
import { privateResponse } from "./http";
import { authProviderFetch } from "./provider-fetch";

export function createAuthContext(request: NextRequest) {
  const config = authConfiguration();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const secureOptions = (options: CookieOptions = {}): CookieOptions => ({
    ...options, domain: undefined, httpOnly: true, secure: config.secure, sameSite: "lax", path: "/",
  });
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { name: "pactum-auth", ...secureOptions() },
    auth: { flowType: "pkce", autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
    global: { fetch: authProviderFetch },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookies => {
        for (const cookie of cookies) {
          request.cookies.set(cookie.name, cookie.value);
          pending.set(cookie.name, { ...cookie, options: secureOptions(cookie.options) });
        }
      },
    },
  });
  return {
    client,
    clearCookies() {
      for (const { name } of [...request.cookies.getAll(), ...pending.values()]) {
        if (/^pactum-auth(?:$|\.|-code-verifier(?:$|\.))/.test(name)) {
          pending.set(name, { name, value: "", options: secureOptions({ maxAge: 0 }) });
        }
      }
    },
    finish(response: NextResponse): NextResponse {
      for (const cookie of pending.values()) response.cookies.set(cookie.name, cookie.value, cookie.options);
      return privateResponse(response);
    },
  };
}

export type AuthContext = ReturnType<typeof createAuthContext>;
