import { fetchGitLabDeveloperData } from "@/lib/providers/gitlab/api";
import type {
  FetchOptions,
  ProviderDeveloperData,
  ProviderIdentity,
  SourceProvider,
} from "@/lib/providers/types";

export const gitlabProvider: SourceProvider = {
  name: "gitlab",

  extractIdentity(userMetadata: Record<string, unknown>): ProviderIdentity | null {
    // GitLab's OIDC profile (via Supabase) places the username under one of
    // `nickname` / `preferred_username` / `user_name` depending on the
    // IdP/scope combination. If NONE of those are present — as is the case
    // for Softplan's SAML-backed SSO, which only sends sub/email/name —
    // don't fall back to splitting the email: the local part of the email
    // ("sylvio.junior") is frequently NOT the GitLab username ("stsjr"),
    // and upserting under the wrong login lets unrelated accounts overwrite
    // each other on conflict. Return null instead so the caller is forced
    // to resolve the real username via /users/:provider_id (OIDC sub).
    const login =
      (userMetadata.nickname as string | undefined) ??
      (userMetadata.preferred_username as string | undefined) ??
      (userMetadata.user_name as string | undefined) ??
      null;
    if (!login) return null;

    return {
      login: login.toLowerCase(),
      externalId: (userMetadata.provider_id as number | undefined) ?? 0,
      name: (userMetadata.full_name as string | undefined) ?? (userMetadata.name as string | undefined) ?? null,
      avatar_url: (userMetadata.avatar_url as string | undefined) ?? (userMetadata.picture as string | undefined) ?? null,
    };
  },

  async fetchDeveloperData(
    login: string,
    opts?: FetchOptions,
  ): Promise<ProviderDeveloperData> {
    return fetchGitLabDeveloperData(login, opts);
  },
};
