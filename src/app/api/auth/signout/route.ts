import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

// The client calls this via fetch(), not navigation, so a 302 redirect here
// was useless — fetch() follows it silently. Also, deriving the redirect
// target from `new URL(request.url).origin` was unsafe behind Railway's
// proxy (it fell back to localhost when the Host header wasn't rewritten).
// Return an empty 204 and let the client decide navigation.
export async function POST() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return new NextResponse(null, { status: 204 });
}
