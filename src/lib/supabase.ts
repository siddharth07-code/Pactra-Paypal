import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://placeholder.supabase.co";

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_dummy_key_00000000";

/**
 * Client-side Supabase instance.
 * For browser environments, stores auth tokens in the pactum-auth cookie partition.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
  cookieOptions: {
    name: "pactum-auth",
    sameSite: "lax",
    path: "/",
  },
  auth: {
    flowType: "pkce",
    autoRefreshToken: typeof window !== "undefined",
    persistSession: true,
  },
});

