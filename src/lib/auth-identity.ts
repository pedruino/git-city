import { getProviderFromSession } from "@/lib/providers";
import { fetchGitLabUserById } from "@/lib/providers/gitlab/api";

type MinimalUser = {
  user_metadata?: Record<string, unknown>;
  app_metadata?: { provider?: string };
};

/**
 * Sync login extraction from Supabase metadata. Returns empty string when
 * metadata doesn't carry a username field — callers that also have network
 * access should prefer `resolveLoginFromSupabaseUser` so they can fall back
 * to a provider API lookup by `provider_id`.
 */
export function loginFromSupabaseUser(user: MinimalUser): string {
  if (!user.user_metadata) return "";
  const provider = getProviderFromSession(user);
  const identity = provider.extractIdentity(user.user_metadata);
  return identity?.login ?? "";
}

/**
 * Async login resolver. Use this on the server when you need the real
 * provider username and the sync metadata didn't include one — e.g. on
 * Softplan's SAML-backed GitLab SSO, which only ships
 * sub/email/full_name/name/avatar_url/provider_id. In that case we look up
 * `/users/:provider_id` on the GitLab API to get the real username.
 * Returns an empty string if the lookup fails.
 */
export async function resolveLoginFromSupabaseUser(
  user: MinimalUser & { email?: string | null },
  opts?: { accessToken?: string },
): Promise<string> {
  const direct = loginFromSupabaseUser(user);
  if (direct) return direct;

  const provider = user.app_metadata?.provider;
  if (provider !== "gitlab") return "";

  const providerId = (user.user_metadata?.provider_id ??
    user.user_metadata?.sub) as string | number | undefined;
  if (providerId) {
    const glUser = await fetchGitLabUserById(providerId, opts?.accessToken);
    const fromApi = glUser?.username?.toLowerCase() ?? "";
    if (fromApi) return fromApi;
  }

  // Last-resort fallback: on Softplan's SAML flow the public GitLab API
  // returns 403 without a token, so we derive the login from the email
  // local-part. It matches the GitLab username 1:1 for the @softplan.com.br
  // corporate tenant (e.g. `sylvio.junior@softplan.com.br` → `sylvio.junior`).
  const email = user.email ?? (user.user_metadata?.email as string | undefined);
  if (email && email.includes("@")) {
    return email.split("@")[0].toLowerCase();
  }

  return "";
}
