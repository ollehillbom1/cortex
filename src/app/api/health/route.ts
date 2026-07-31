import { NextResponse } from "next/server";

/** Liveness probe for Docker / reverse proxies. No data is read or written. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
