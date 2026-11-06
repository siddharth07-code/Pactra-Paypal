import { NextRequest } from "next/server";
import { handleAuth } from "@/lib/auth/handlers";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return handleAuth(request, "session"); }
