import { githubProvider } from "@/lib/providers/github";
import { gitlabProvider } from "@/lib/providers/gitlab";
import type { ProviderName, SourceProvider } from "@/lib/providers/types";

export type { ProviderName, SourceProvider, ProviderDeveloperData, ProviderIdentity, FetchOptions } from "@/lib/providers/types";
export { ProviderFetchError } from "@/lib/providers/types";

const providers: Record<ProviderName, SourceProvider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function getProvider(name: ProviderName): SourceProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(
      `Provider "${name}" is not available. Did you forget to enable it?`,
    );
  }
  return provider;
}

export function isProviderRegistered(name: string): name is ProviderName {
  return name in providers;
}

export function getProviderFromSession(user: {
  app_metadata?: { provider?: string };
}): SourceProvider {
  const name = (user.app_metadata?.provider ?? "github") as ProviderName;
  if (!(name in providers)) {
    throw new Error(`Unknown auth provider: ${name}`);
  }
  return getProvider(name);
}

export function isProviderEnabled(name: ProviderName): boolean {
  if (name === "gitlab") {
    return process.env.NEXT_PUBLIC_GITLAB_ENABLED === "true";
  }
  return true;
}
