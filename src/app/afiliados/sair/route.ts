import { NextResponse } from "next/server";
import { clearAffiliateSession } from "@/lib/affiliate-auth";

export async function POST(req: Request) {
  await clearAffiliateSession();
  return NextResponse.redirect(new URL("/afiliados/login", req.url), 303);
}
