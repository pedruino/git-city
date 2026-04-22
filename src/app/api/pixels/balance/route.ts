import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { resolveLoginFromSupabaseUser } from "@/lib/auth-identity";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBalance } from "@/lib/pixels";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: { session: __session } } = await supabase.auth.getSession();
  const githubLogin = await resolveLoginFromSupabaseUser(user, { accessToken: __session?.provider_token ?? undefined });

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (!dev) return NextResponse.json({ balance: 0 });

  const wallet = await getBalance(dev.id);
  return NextResponse.json(wallet);
}
