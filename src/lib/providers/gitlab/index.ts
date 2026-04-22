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
    // Supabase's GitLab provider puts the username in `nickname` or
    // `preferred_username` depending on the GitLab OIDC profile.
    let login =
      (userMetadata.nickname as string | undefined) ??
      (userMetadata.preferred_username as string | undefined) ??
      (userMetadata.user_name as string | undefined) ??
      null;
    // Fallback: derive from email local-part (user@gitlab.com → user)
    if (!login && typeof userMetadata.email === "string") {
      login = userMetadata.email.split("@")[0];
    }
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
