import { NextResponse } from "next/server";
import { resolveLoginFromSupabaseUser } from "@/lib/auth-identity";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function getAuthenticatedDevId(): Promise<{ devId: number } | { error: string; status: number }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 };

  const { data: { session: __session } } = await supabase.auth.getSession();
  const githubLogin = await resolveLoginFromSupabaseUser(user, { accessToken: __session?.provider_token ?? undefined });

  if (!githubLogin) return { error: "No GitHub login found", status: 400 };

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (!dev) return { error: "Developer not found", status: 404 };
  return { devId: dev.id };
}

export async function GET() {
  const auth = await getAuthenticatedDevId();
  if ("error" in auth) {
    // For the "no dev record yet" case, return 200 with null key — the client
    // already handles this gracefully and it avoids a noisy 404 in the console
    // for every logged-in user who hasn't claimed a building.
    if (auth.status === 404) {
      return NextResponse.json({ key: null }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("vscode_api_key")
    .eq("id", auth.devId)
    .single();

  return NextResponse.json({ key: dev?.vscode_api_key ?? null }, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}

export async function POST() {
  const auth = await getAuthenticatedDevId();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sb = getSupabaseAdmin();

  // Check if key already exists
  const { data: existing } = await sb
    .from("developers")
    .select("vscode_api_key")
    .eq("id", auth.devId)
    .single();

  if (existing?.vscode_api_key) {
    return NextResponse.json({ key: existing.vscode_api_key });
  }

  const newKey = crypto.randomBytes(32).toString("base64url");

  const { error } = await sb
    .from("developers")
    .update({
      vscode_api_key: newKey,
      vscode_api_key_hash: hashKey(newKey),
    })
    .eq("id", auth.devId);

  if (error) {
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }

  return NextResponse.json({ key: newKey });
}
