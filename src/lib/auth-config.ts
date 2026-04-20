// Single source of truth for the active auth/source provider.
// Controlled by NEXT_PUBLIC_AUTH_PROVIDER=github|gitlab.
//
// Everything user-facing (copy, repo URLs, API hosts) should read from here
// so changing the env var re-skins the app to the chosen provider.

export type ProviderName = "github" | "gitlab";

function readProviderFromEnv(): ProviderName {
  const raw = (process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? "github").toLowerCase();
  if (raw === "gitlab") return "gitlab";
  return "github";
}

export const ACTIVE_PROVIDER: ProviderName = readProviderFromEnv();

export interface ProviderConfig {
  name: ProviderName;
  displayName: string;       // "GitHub" / "GitLab"
  buttonColor: string;       // hex for "Sign in with X" CTA
  host: string;              // https://github.com or https://gitlab.com
  profileUrlFor: (username: string) => string;
  avatarUrlFor: (username: string, size?: number) => string;
  repoStarUrl: string;       // link used by the "★" badge header
  /** Optional SAML SSO URL — when set, login pre-redirects here first. */
  samlSsoUrl: string | null;
}

const GITHUB_CONFIG: ProviderConfig = {
  name: "github",
  displayName: "GitHub",
  buttonColor: "", // falls back to theme.accent
  host: "https://github.com",
  profileUrlFor: (u) => `https://github.com/${u}`,
  avatarUrlFor: (u, size = 80) => `https://github.com/${u}.png?size=${size}`,
  repoStarUrl: "https://github.com/srizzon/git-city",
  samlSsoUrl: null,
};

function buildGitLabConfig(): ProviderConfig {
  const host = (process.env.NEXT_PUBLIC_GITLAB_HOST ?? "https://gitlab.com").replace(/\/$/, "");
  const saml = process.env.NEXT_PUBLIC_GITLAB_SAML_SSO_URL?.trim() || null;
  return {
    name: "gitlab",
    displayName: "GitLab",
    buttonColor: "#FC6D26",
    host,
    profileUrlFor: (u) => `${host}/${u}`,
    avatarUrlFor: (u) => `${host}/${u}.png`,
    repoStarUrl: `${host}/srizzon/git-city`,
    samlSsoUrl: saml,
  };
}

export function getProviderConfig(): ProviderConfig {
  return ACTIVE_PROVIDER === "gitlab" ? buildGitLabConfig() : GITHUB_CONFIG;
}

export const providerConfig: ProviderConfig = getProviderConfig();
