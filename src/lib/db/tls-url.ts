import fs from "node:fs";
import path from "node:path";

/** Keep the stored URL portable; resolve the packaged public CA in the deployed process. */
export function runtimeTlsUrl(value: string): string {
  const url = new URL(value);
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return value;
  const ca = path.resolve(process.cwd(), "prisma/certs/supabase-ca.cer");
  if (url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict" ||
      url.searchParams.get("sslcert") !== "certs/supabase-ca.cer" || url.searchParams.has("sslrootcert")) throw new Error("Strict database TLS and the packaged Supabase CA are required.");
  fs.accessSync(ca, fs.constants.R_OK);
  url.searchParams.set("sslcert", ca);
  return url.href;
}
