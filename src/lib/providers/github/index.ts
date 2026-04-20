import {
  fetchGitHubDeveloperData,
  GitHubFetchError,
} from "@/lib/github-api";
import type {
  FetchOptions,
  ProviderDeveloperData,
  ProviderIdentity,
  SourceProvider,
} from "@/lib/providers/types";
import { ProviderFetchError } from "@/lib/providers/types";

export const githubProvider: SourceProvider = {
  name: "github",

  extractIdentity(userMetadata: Record<string, unknown>): ProviderIdentity | null {
    const login =
      (userMetadata.user_name as string | undefined) ??
      (userMetadata.preferred_username as string | undefined) ??
      null;
    if (!login) return null;

    return {
      login: login.toLowerCase(),
      externalId: (userMetadata.provider_id as number | undefined) ?? 0,
      name: (userMetadata.full_name as string | undefined) ?? null,
      avatar_url: (userMetadata.avatar_url as string | undefined) ?? null,
    };
  },

  async fetchDeveloperData(
    login: string,
    opts?: FetchOptions,
  ): Promise<ProviderDeveloperData> {
    try {
      return await fetchGitHubDeveloperData(login, opts);
    } catch (err) {
      if (err instanceof GitHubFetchError) {
        throw new ProviderFetchError("github", err.code, err.message, err.status);
      }
      throw err;
    }
  },
};
