import { NextRequest } from "next/server";
import { organizationRoute } from "@/lib/organizations/http";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return organizationRoute(request, "list"); }
export async function POST(request: NextRequest) { return organizationRoute(request, "create"); }
