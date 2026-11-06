import { NextRequest } from "next/server";
import { handleConfirmation } from "@/lib/auth/handlers";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return handleConfirmation(request); }
