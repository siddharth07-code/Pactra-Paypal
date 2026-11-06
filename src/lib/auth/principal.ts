import "server-only";
import type { AuthContext } from "./supabase-server";
import { AuthError, providerError } from "./config";

// Identity only. Organization membership and financial permission are deliberately absent.
export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: true;
  readonly verifiedAt: string;
}

export async function requireAuthenticatedUser(context: AuthContext): Promise<AuthenticatedPrincipal> {
  const { data, error } = await context.client.auth.getUser();
  if (error?.name === "AuthSessionMissingError") throw new AuthError(401, "AUTH_REQUIRED", "Sign in to continue.");
  providerError(error);
  const user = data.user;
  if (!user || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(user.id) || user.aud !== "authenticated") {
    throw new AuthError(401, "AUTH_REQUIRED", "A verified authentication session is required.");
  }
  if (!user.email || !user.email_confirmed_at) throw new AuthError(403, "AUTH_EMAIL_UNVERIFIED", "Confirm your email before signing in.");
  return Object.freeze({ userId: user.id, email: user.email, emailVerified: true, verifiedAt: new Date().toISOString() });
}

export const requireVerifiedSession = requireAuthenticatedUser;
