import { githubProvider } from "@/lib/providers/github";
import { gitlabProvider } from "@/lib/providers/gitlab";
import type { ProviderName, SourceProvider } from "@/lib/providers/types";
import { ACTIVE_PROVIDER } from "@/lib/auth-config";

export type { ProviderName, SourceProvider, ProviderDeveloperData, ProviderIdentity, FetchOptions } from "@/lib/providers/types";
export { ProviderFetchError } from "@/lib/providers/types";

const providers: Record<ProviderName, SourceProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function getProvider(name: ProviderName): SourceProvider {
  return providers[name];
}

export function getActiveProvider(): SourceProvider {
  return providers[ACTIVE_PROVIDER];
}

export function isProviderRegistered(name: string): name is ProviderName {
  return name in providers;
}

/**
 * Resolve the provider for a Supabase session — preferred over the env var
 * when we have a real session (since the env might change across deploys but
 * the session is locked to the provider that issued the token).
 */
export function getProviderFromSession(user: {
  app_metadata?: { provider?: string };
}): SourceProvider {
  const name = (user.app_metadata?.provider ?? ACTIVE_PROVIDER) as ProviderName;
  if (!(name in providers)) {
    // Fall back to active provider instead of throwing — keeps login resilient.
    return getActiveProvider();
  }
  return providers[name];
}
