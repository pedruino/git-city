import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { ACTIVE_PROVIDER, getProviderConfig } from "@/lib/auth-config";

/**
 * Unified sign-in entry point. Uses the provider configured by
 * NEXT_PUBLIC_AUTH_PROVIDER. If the provider has a SAML SSO URL, redirect
 * there first (with a hop param so we come back here to finish OAuth).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const redirectPath = searchParams.get("redirect") ?? "/";
  const samlDone = searchParams.get("saml_done") === "1";
  const config = getProviderConfig();

  console.log("[auth/signin] hit", { origin, samlDone, redirectPath, hasSamlUrl: !!config.samlSsoUrl });

  // Step 1 — if provider requires SAML SSO and we haven't passed through it yet,
  // bounce the user to the SAML endpoint. After SAML, browser returns here via
  // the `redirect` query param set by the SSO service.
  if (config.samlSsoUrl && !samlDone) {
    const returnHere = `${origin}/api/auth/signin?saml_done=1&redirect=${encodeURIComponent(redirectPath)}`;
    const samlUrl = withRedirect(config.samlSsoUrl, returnHere);
    console.log("[auth/signin] redirecting to SAML", { samlUrl });
    return NextResponse.redirect(samlUrl);
  }

  // Step 2 — normal OAuth with Supabase using the active provider.
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

/** Append or replace `?redirect=...` on the SAML URL so it comes back to us. */
function withRedirect(samlUrl: string, returnTo: string): string {
  const u = new URL(samlUrl);
  u.searchParams.set("redirect", returnTo);
  return u.toString();
}
