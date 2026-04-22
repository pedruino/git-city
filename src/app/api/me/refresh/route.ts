import { NextResponse, after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProviderFromSession } from "@/lib/providers";
import { resolveLoginFromSupabaseUser } from "@/lib/auth-identity";

// Refresh the logged-in user's dev record using their own OAuth token.
// Called by the client when the snapshot is stale. Token is used in memory
// only — never persisted.
export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const provider = getProviderFromSession(session.user);
  const providerToken = session.provider_token ?? undefined;
  const login = await resolveLoginFromSupabaseUser(session.user, {
    accessToken: providerToken,
  });

  if (!login) {
    return NextResponse.json({ error: "no_provider_identity" }, { status: 400 });
  }

  try {
    const ghData = await provider.fetchDeveloperData(login, {
      allowEmpty: true,
      accessToken: providerToken,
    });

    const admin = getSupabaseAdmin();
    const { data: updated, error } = await admin
      .from("developers")
      .upsert(
        {
          ...ghData,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "github_login" },
      )
      .select("id, contributions, active_days_last_year, current_streak, longest_streak")
      .single();

    if (error) {
      console.error("refresh upsert failed:", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // Fire-and-forget: regenerate the public snapshot so the client sees fresh
    // data on next home load without waiting for the scheduled cron.
    if (process.env.CRON_SECRET) {
      const origin = new URL(request.url).origin;
      after(async () => {
        try {
          await fetch(`${origin}/api/cron/city-snapshot`, {
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          });
        } catch (err) {
          console.error("Post-refresh snapshot regeneration failed:", err);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      login,
      has_token: !!providerToken,
      contributions: updated?.contributions ?? 0,
      active_days: updated?.active_days_last_year ?? 0,
      current_streak: updated?.current_streak ?? 0,
      longest_streak: updated?.longest_streak ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("refresh fetch failed:", msg);
    return NextResponse.json({ error: "fetch_failed", detail: msg }, { status: 502 });
  }
}
