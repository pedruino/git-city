import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { resolveLoginFromSupabaseUser } from "@/lib/auth-identity";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: { session: __session } } = await supabase.auth.getSession();
  const githubLogin = await resolveLoginFromSupabaseUser(user, { accessToken: __session?.provider_token ?? undefined });

  if (!githubLogin) {
    return NextResponse.json({ error: "No GitHub login" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: dev } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  await sb
    .from("developer_achievements")
    .update({ seen: true })
    .eq("developer_id", dev.id)
    .eq("seen", false);

  return NextResponse.json({ ok: true });
}
