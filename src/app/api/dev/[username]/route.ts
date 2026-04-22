import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { calculateGithubXp } from "@/lib/xp";
import { getActiveProvider, ProviderFetchError } from "@/lib/providers";
import { loginFromSupabaseUser } from "@/lib/auth-identity";

// Allow up to 60s on Vercel (Pro plan). Hobby plan max is 10s.
export const maxDuration = 60;

// ─── Rate Limiting ───────────────────────────────────────────
async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isRateLimited(key: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const ipHash = await hashKey(key);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await sb
    .from("add_requests")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneHourAgo);

  return (count ?? 0) >= 10;
}

async function recordRateLimitRequest(key: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const ipHash = await hashKey(key);
  await sb.from("add_requests").insert({ ip_hash: ipHash });
}

async function resolveRateLimitKey(request: Request): Promise<string> {
  try {
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) return `user:${user.id}`;
  } catch { /* fall through to IP */ }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ─── Route Handler ───────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const sb = getSupabaseAdmin();

  const { data: cached } = await sb
    .from("developers")
    .select("*")
    .eq("github_login", username.toLowerCase())
    .single();

  // ─── New dev ───────────────────────────────────────────────
  if (!cached) {
    // Check if authenticated user is looking up their own profile
    let isOwnProfile = false;
    let authUserId: string | null = null;
    try {
      const authClient = await createServerSupabase();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        authUserId = user.id;
        // Use the provider-aware helper so GitLab sessions (whose metadata has
        // no `user_name`/`preferred_username`) still resolve via nickname or
        // email-local-part fallback. Without this, the self-heal branch below
        // never fires for GitLab users whose auth/callback upsert failed.
        const authLogin = loginFromSupabaseUser(user).toLowerCase();
        isOwnProfile = authLogin === username.toLowerCase();
      }
    } catch {}

    // Rate limit (skip for own profile — they just logged in)
    let rateLimitKey: string | null = null;
    if (!isOwnProfile && process.env.NODE_ENV !== "development") {
      const key = await resolveRateLimitKey(request);
      rateLimitKey = key;
      const limited = await isRateLimited(key);
      if (limited) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Max 10 lookups per hour." },
          { status: 429 },
        );
      }
    }

    try {
      const data = await getActiveProvider().fetchDeveloperData(username, isOwnProfile ? { allowEmpty: true } : undefined);
      if (rateLimitKey) await recordRateLimitRequest(rateLimitKey);

      // Own profile: create building as fallback (auth callback may have failed)
      if (isOwnProfile && authUserId) {
        const { data: created, error: createErr } = await sb
          .from("developers")
          .upsert({
            ...data,
            fetched_at: new Date().toISOString(),
            claimed: true,
            claimed_by: authUserId,
            claimed_at: new Date().toISOString(),
            fetch_priority: 1,
          }, { onConflict: "github_login" })
          .select()
          .single();

        if (created && !createErr) {
          // Rank + XP
          await sb.rpc("assign_new_dev_rank", { dev_id: created.id });
          sb.rpc("recalculate_ranks").then(() => {}, () => {});

          const xp = calculateGithubXp({
            contributions: data.contributions_total ?? data.contributions,
            total_stars: data.total_stars,
            public_repos: data.public_repos,
            total_prs: data.total_prs ?? 0,
          });
          if (xp > 0) {
            await sb.rpc("grant_xp", { p_developer_id: created.id, p_source: "github", p_amount: xp });
            await sb.from("developers").update({ xp_github: xp }).eq("id", created.id);
          }

          // Re-fetch with assigned rank
          const { data: withRank } = await sb
            .from("developers")
            .select("*")
            .eq("id", created.id)
            .single();

          revalidatePath(`/dev/${data.github_login}`);
          return NextResponse.json({ ...(withRank ?? created), exists: true });
        }
      }

      // Not own profile (or creation failed): return preview
      return NextResponse.json({
        exists: false,
        preview: {
          github_login: data.github_login,
          avatar_url: data.avatar_url,
          name: data.name,
          bio: data.bio,
          contributions: data.contributions,
          public_repos: data.public_repos,
          total_stars: data.total_stars,
          primary_language: data.primary_language,
        },
      });
    } catch (err) {
      if (err instanceof ProviderFetchError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
      return NextResponse.json(
        { error: isTimeout ? "Provider API timed out. Please try again." : "Failed to fetch provider data" },
        { status: isTimeout ? 504 : 500 },
      );
    }
  }

  // ─── Existing dev: return cached, refresh in background ───

  const STATS_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const cachedAge = cached.fetched_at
    ? Date.now() - new Date(cached.fetched_at).getTime()
    : Number.POSITIVE_INFINITY;
  const needsStatsRefresh = Number.isNaN(cachedAge) || cachedAge >= STATS_REFRESH_INTERVAL;

  if (needsStatsRefresh) {
    after(async () => {
      try {
        await refreshDeveloper(username, cached);
      } catch (err) {
        console.error("Background refresh error:", err);
      }
    });
  }

  return NextResponse.json(
    { ...cached, exists: true, ...(needsStatsRefresh ? { _stale: true } : {}) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}

// ─── Background Refresh ───────────────────────────────────────

async function refreshDeveloper(
  username: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached: Record<string, any>,
) {
  const sb = getSupabaseAdmin();
  // Delegate fetch to the currently active provider (GitHub or GitLab). The
  // provider knows its own API shape and how to build a ProviderDeveloperData.
  let data;
  try {
    data = await getActiveProvider().fetchDeveloperData(username);
  } catch (err) {
    console.error("refreshDeveloper fetch error:", err);
    return;
  }

  const record = {
    ...data,
    fetched_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertError } = await sb
    .from("developers")
    .upsert(record, { onConflict: "github_login" })
    .select()
    .single();

  if (upsertError) {
    console.error("Background upsert error:", upsertError);
    return;
  }

  const devId = upserted?.id;
  if (devId) {
    const newGithubXp = calculateGithubXp({
      contributions: data.contributions_total ?? data.contributions,
      total_stars: data.total_stars,
      public_repos: data.public_repos,
      total_prs: data.total_prs ?? 0,
    });
    const prevGithubXp = (cached.xp_github as number) ?? 0;
    if (newGithubXp > prevGithubXp) {
      const diff = newGithubXp - prevGithubXp;
      await sb.rpc("grant_xp", { p_developer_id: devId, p_source: "github", p_amount: diff });
      await sb.from("developers").update({ xp_github: newGithubXp }).eq("id", devId);
    }
  }

  if (devId && upserted && !upserted.claimed) {
    const admin = getSupabaseAdmin();
    const { data: matchedUsers } = await admin.rpc("find_auth_user_by_github_login", {
      p_github_login: upserted.github_login,
    });
    const matchedUser = (matchedUsers as { id: string }[] | null)?.[0];
    if (matchedUser?.id) {
      await admin
        .from("developers")
        .update({
          claimed: true,
          claimed_by: matchedUser.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", devId)
        .eq("claimed", false);
    }
  }

  revalidatePath(`/dev/${record.github_login}`);
}
