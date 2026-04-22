import { NextResponse } from "next/server";

/**
 * Liveness/readiness probe for Railway (or any other platform healthchecker).
 * Intentionally excluded from the middleware matcher (see src/middleware.ts)
 * so the probe doesn't trip the rate limiter and doesn't pay the cost of
 * Supabase session refresh. Returns a minimal 200 and never touches external
 * services — a non-200 here really means "the Node process is dead."
 */
export function GET() {
  return NextResponse.json(
    { ok: true, t: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
