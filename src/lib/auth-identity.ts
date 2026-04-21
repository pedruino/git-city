import { getProviderFromSession } from "@/lib/providers";

/**
 * Normalized login extraction from a Supabase session user. Previously
 * code scattered across 16 route handlers read `user.user_metadata.user_name`
 * directly — that field only exists on GitHub OAuth. For GitLab OIDC we
 * need to fall back to nickname/preferred_username/email-local-part.
 * Delegates to the active provider's extractIdentity().
 */
export function loginFromSupabaseUser(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: { provider?: string };
}): string {
  if (!user.user_metadata) return "";
  const provider = getProviderFromSession(user);
  const identity = provider.extractIdentity(user.user_metadata);
  return identity?.login ?? "";
}
