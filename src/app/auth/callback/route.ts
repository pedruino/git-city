import { NextResponse, after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkAchievements } from "@/lib/achievements";
import { cacheEmailFromAuth, touchLastActive, ensurePreferences } from "@/lib/notification-helpers";
import { sendWelcomeNotification } from "@/lib/notification-senders/welcome";
import { sendReferralJoinedNotification } from "@/lib/notification-senders/referral";
import { getProviderFromSession } from "@/lib/providers";
import { ACTIVE_PROVIDER } from "@/lib/auth-config";
import { fetchGitLabUserById } from "@/lib/providers/gitlab/api";
import { calculateGithubXp } from "@/lib/xp";

// Extend timeout for GitHub API calls during login
export const maxDuration = 60;

// Tenant allow-list for SSO. Only accept users whose email belongs to one of
// these domains. Prevents external accounts (whose `provider_id` could map to
// an unrelated GitLab username) from claiming records. Configurable via
// AUTH_ALLOWED_EMAIL_DOMAINS (comma-separated); falls back to the hard default
// that matches the fork's target tenant.
const ALLOWED_EMAIL_DOMAINS = (
  process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? "softplan.com.br"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function emailDomainAllowed(email: string | null | undefined): boolean {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  console.log("[auth/callback] hit", { origin, hasCode: !!code, query: Object.fromEntries(searchParams) });

  if (!code) {
    console.warn("[auth/callback] no code — redirecting with ?error=no_code");
    return NextResponse.redirect(`${origin}/?error=no_code`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/callback] exchangeCodeForSession failed", { error, hasUser: !!data?.user });
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  console.log("[auth/callback] session exchanged", {
    userId: data.user.id,
    email: data.user.email,
    provider: data.user.app_metadata?.provider,
    metadataKeys: Object.keys(data.user.user_metadata ?? {}),
  });

  // Enforce tenant allow-list before touching anything. If the email is
  // outside the allow-list we sign the session out so the user ends up
  // anonymous on the home with an explicit error.
  const userEmail = (data.user.email ?? data.user.user_metadata?.email) as
    | string
    | undefined;
  if (!emailDomainAllowed(userEmail)) {
    await supabase.auth.signOut().catch(() => {});
    return NextResponse.redirect(`${origin}/?error=unauthorized_domain`);
  }

  const provider = getProviderFromSession(data.user);
  const identity = provider.extractIdentity(data.user.user_metadata ?? {});
  let githubLogin = identity?.login ?? "";

  // For GitLab, metadata doesn't expose the real username. Resolve it via the
  // API using provider_id (OIDC sub) instead of relying on the brittle
  // email-local-part fallback — a user's GitLab username is frequently
  // different from their email local part (e.g. `sylvio.junior@…` vs
  // actual username `stsjr`).
  if (ACTIVE_PROVIDER === "gitlab") {
    const providerId = (data.user.user_metadata?.provider_id ??
      data.user.user_metadata?.sub) as string | number | undefined;
    if (providerId) {
      const glUser = await fetchGitLabUserById(
        providerId,
        data.session?.provider_token ?? undefined,
      );
      if (glUser?.username) {
        githubLogin = glUser.username.toLowerCase();
      }
    }
  }

  // User's own OAuth access token from the provider (GitLab/GitHub). Supabase
  // keeps it on the session; we use it in memory during this request only —
  // never persisted. Enables fetching the user's own data with their scope
  // instead of a shared master token.
  const providerToken = data.session?.provider_token ?? undefined;

  const admin = getSupabaseAdmin();

  if (githubLogin) {
    // Check if dev already exists in the database
    const { data: existingDev } = await admin
      .from("developers")
      .select("id, claimed")
      .eq("github_login", githubLogin)
      .maybeSingle();

    if (!existingDev) {
      // ─── New dev: create building from provider data on login ───
      try {
        const ghData = await provider.fetchDeveloperData(githubLogin, {
          allowEmpty: true,
          accessToken: providerToken,
        });

        const { data: created, error: createErr } = await admin
          .from("developers")
          .upsert({
            ...ghData,
            fetched_at: new Date().toISOString(),
            claimed: true,
            claimed_by: data.user.id,
            claimed_at: new Date().toISOString(),
            fetch_priority: 1,
          }, { onConflict: "github_login" })
          .select("id")
          .single();

        if (created && !createErr) {
          // GitHub XP
          const xp = calculateGithubXp({
            contributions: ghData.contributions_total ?? ghData.contributions,
            total_stars: ghData.total_stars,
            public_repos: ghData.public_repos,
            total_prs: ghData.total_prs ?? 0,
          });
          if (xp > 0) {
            await admin.rpc("grant_xp", { p_developer_id: created.id, p_source: "github", p_amount: xp });
            await admin.from("developers").update({ xp_github: xp }).eq("id", created.id);
          }

          // Rank
          await admin.rpc("assign_new_dev_rank", { dev_id: created.id });
          admin.rpc("recalculate_ranks").then(
            () => console.log("Ranks recalculated for new dev:", githubLogin),
            (err: unknown) => console.error("Rank recalculation failed:", err),
          );

          // Feed event
          await admin.from("activity_feed").insert({
            event_type: "dev_joined",
            actor_id: created.id,
            metadata: { login: githubLogin },
          });

          // Notifications
          cacheEmailFromAuth(created.id, data.user.id).catch(() => {});
          ensurePreferences(created.id).catch(() => {});
          sendWelcomeNotification(created.id, githubLogin);
        }
      } catch (err) {
        console.error("Failed to create dev on login:", err);
      }
    } else {
      // ─── Existing dev: refresh data with their own OAuth token ───
      // Runs on every login so the building reflects recent activity.
      // Failures here don't block login — stale data is still usable.
      try {
        const ghData = await provider.fetchDeveloperData(githubLogin, {
          allowEmpty: true,
          accessToken: providerToken,
        });
        const claimFields = existingDev.claimed
          ? {}
          : {
              claimed: true,
              claimed_by: data.user.id,
              claimed_at: new Date().toISOString(),
              fetch_priority: 1,
            };
        await admin
          .from("developers")
          .update({
            ...ghData,
            fetched_at: new Date().toISOString(),
            ...claimFields,
          })
          .eq("id", existingDev.id);
      } catch (err) {
        console.error("Failed to refresh dev data on login:", err);
        // Still claim the building even if fetch failed.
        if (!existingDev.claimed) {
          await admin
            .from("developers")
            .update({
              claimed: true,
              claimed_by: data.user.id,
              claimed_at: new Date().toISOString(),
              fetch_priority: 1,
            })
            .eq("id", existingDev.id)
            .eq("claimed", false);
        }
      }

      if (!existingDev.claimed) {
        await admin.from("activity_feed").insert({
          event_type: "dev_joined",
          actor_id: existingDev.id,
          metadata: { login: githubLogin },
        });

        cacheEmailFromAuth(existingDev.id, data.user.id).catch(() => {});
        ensurePreferences(existingDev.id).catch(() => {});
        sendWelcomeNotification(existingDev.id, githubLogin);
      }
    }

    // Fetch dev record for achievement check + referral processing
    // Uses try-catch to avoid breaking login if v2 columns/tables don't exist yet
    try {
      const { data: dev } = await admin
        .from("developers")
        .select("id, contributions, public_repos, total_stars, kudos_count, referral_count, referred_by")
        .eq("github_login", githubLogin)
        .single();

      if (dev) {
        // Cache email + update last_active_at on every login
        cacheEmailFromAuth(dev.id, data.user.id).catch(() => {});
        touchLastActive(dev.id);

        // Process referral (from ?ref= param forwarded by client)
        const ref = searchParams.get("ref");
        if (ref && ref !== githubLogin && !dev.referred_by) {
          const { data: referrer } = await admin
            .from("developers")
            .select("id, github_login")
            .eq("github_login", ref.toLowerCase())
            .single();

          if (referrer) {
            await admin
              .from("developers")
              .update({ referred_by: referrer.github_login })
              .eq("id", dev.id);

            await admin.rpc("increment_referral_count", { referrer_dev_id: referrer.id });

            await admin.from("activity_feed").insert({
              event_type: "referral",
              actor_id: referrer.id,
              target_id: dev.id,
              metadata: { referrer_login: referrer.github_login, referred_login: githubLogin },
            });

            // Notify referrer that their referral joined
            sendReferralJoinedNotification(referrer.id, referrer.github_login, githubLogin, dev.id);

            // Check referral achievements for the referrer
            const { data: referrerFull } = await admin
              .from("developers")
              .select("referral_count, kudos_count, contributions, public_repos, total_stars")
              .eq("id", referrer.id)
              .single();

            if (referrerFull) {
              const giftsSent = await countGifts(admin, referrer.id, "sent");
              const giftsReceived = await countGifts(admin, referrer.id, "received");
              await checkAchievements(referrer.id, {
                contributions: referrerFull.contributions,
                public_repos: referrerFull.public_repos,
                total_stars: referrerFull.total_stars,
                referral_count: referrerFull.referral_count,
                kudos_count: referrerFull.kudos_count,
                gifts_sent: giftsSent,
                gifts_received: giftsReceived,
              }, referrer.github_login);
            }
          }
        }

        // Run achievement check for this developer
        const giftsSent = await countGifts(admin, dev.id, "sent");
        const giftsReceived = await countGifts(admin, dev.id, "received");
        await checkAchievements(dev.id, {
          contributions: dev.contributions,
          public_repos: dev.public_repos,
          total_stars: dev.total_stars,
          referral_count: dev.referral_count ?? 0,
          kudos_count: dev.kudos_count ?? 0,
          gifts_sent: giftsSent,
          gifts_received: giftsReceived,
        }, githubLogin);
      }
    } catch {
      // Silently skip v2 features if tables/columns don't exist yet
      console.warn("Auth callback: skipping v2 achievement/referral check (migration may not have run)");
    }

    // Regenerate the public city snapshot in the background so the new/updated
    // dev shows up on the home without waiting for the scheduled cron. Only on
    // platforms without Vercel Cron (Railway, self-hosted) is this load-bearing;
    // on Vercel the scheduled run still runs every 10 min as a safety net.
    if (process.env.CRON_SECRET) {
      after(async () => {
        try {
          await fetch(`${origin}/api/cron/city-snapshot`, {
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          });
        } catch (err) {
          console.error("Post-login snapshot refresh failed:", err);
        }
      });
    }
  }

  // Support ?next= param for post-login redirect
  const next = searchParams.get("next");
  if (next && githubLogin) {
    // Special case: /shop redirects to /shop/{username}
    if (next === "/shop") {
      const { data: dev } = await admin
        .from("developers")
        .select("github_login")
        .eq("github_login", githubLogin)
        .single();

      if (!dev) {
        return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
      }

      return NextResponse.redirect(`${origin}/shop/${githubLogin}`);
    }

    // General redirect: only allow relative paths
    if (next.startsWith("/")) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countGifts(admin: any, devId: number, direction: "sent" | "received"): Promise<number> {
  const column = direction === "sent" ? "developer_id" : "gifted_to";
  const { count } = await admin
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq(column, devId)
    .eq("status", "completed")
    .not("gifted_to", "is", null);
  return count ?? 0;
}
