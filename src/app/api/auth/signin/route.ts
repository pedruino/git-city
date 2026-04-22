import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { ACTIVE_PROVIDER } from "@/lib/auth-config";

/**
 * Unified sign-in entry point. Straight OAuth handoff — no separate SAML
 * pre-hop. `gitlab.com/oauth/authorize` transparently reuses whatever
 * SAML/OIDC session the browser already has with gitlab.com, so corporate
 * SSO users land back in the callback without an interactive prompt.
 * Dropping the SAML detour removed a flaky popup handshake that left users
 * stranded on gitlab.com when the `redirect` param was ignored.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  // Behind Railway's proxy request.url reflects the container-internal
  // origin (http://localhost:8080). Using that would make Supabase build
  // OAuth redirects against the private URL. Prefer NEXT_PUBLIC_BASE_URL.
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? url.origin;
  const redirectPath = searchParams.get("redirect") ?? "/";

  console.log("[auth/signin] hit", { origin, redirectPath });

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: ACTIVE_PROVIDER,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      scopes:
        ACTIVE_PROVIDER === "gitlab"
          ? "openid profile email read_user read_api"
          : undefined,
    },
  });

  if (error || !data.url) {
    console.error("[auth/signin] signInWithOAuth failed", { error, hasUrl: !!data?.url });
    return NextResponse.redirect(`${origin}/?error=oauth_failed`);
  }

  console.log("[auth/signin] redirecting to OAuth provider", {
    provider: ACTIVE_PROVIDER,
    oauthUrl: data.url,
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
  });
  return NextResponse.redirect(data.url);
}
