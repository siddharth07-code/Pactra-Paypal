import { NextRequest } from "next/server";
import { handlePasswordRecovery } from "@/lib/auth/password-recovery";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return handlePasswordRecovery(request, false); }
