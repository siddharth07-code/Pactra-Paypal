import { NextRequest } from "next/server";
import { handleAuth } from "@/lib/auth/handlers";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return handleAuth(request, "logout"); }
