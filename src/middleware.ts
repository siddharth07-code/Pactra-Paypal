import { NextRequest, NextResponse } from "next/server";
import { createAuthContext, type AuthContext } from "@/lib/auth/supabase-server";
import { requireAuthenticatedUser } from "@/lib/auth/principal";
import { AuthError, authConfiguration } from "@/lib/auth/config";
import { authFailure } from "@/lib/auth/http";

export async function middleware(request: NextRequest) {
  // Explicit defense even when invoked without the matcher (tests and future configuration edits).
  if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/account" &&
    !request.nextUrl.pathname.startsWith("/account/") && !request.nextUrl.pathname.startsWith("/settlement/")) return NextResponse.next();
  let context: AuthContext | undefined;
  try {
    context = createAuthContext(request);
    await requireAuthenticatedUser(context);
    return context.finish(NextResponse.next({ request: { headers: new Headers(request.headers) } }));
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      context?.clearCookies();
      const response = NextResponse.redirect(new URL("/login", authConfiguration().origin));
      return context ? context.finish(response) : response;
    }
    const response = authFailure(error);
    return context ? context.finish(response) : response;
  }
}

export const config = { matcher: ["/", "/account/:path*", "/settlement/:path*"] };
