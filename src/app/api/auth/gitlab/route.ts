import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

const PROVIDER = "gitlab" as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  // Behind Railway's proxy request.url has the container-internal origin —
  // using it for the OAuth redirect_to would make the browser land on
  // localhost after auth. Prefer the public URL when configured.
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? url.origin;
  const redirectPath = searchParams.get("redirect") ?? "/";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: PROVIDER,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      scopes: "openid profile email read_user read_api",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/?error=oauth_failed`);
  }

  return NextResponse.redirect(data.url);
}
