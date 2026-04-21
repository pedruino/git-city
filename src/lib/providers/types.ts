import type { TopRepo } from "@/lib/github";

export type ProviderName = "github" | "gitlab";

export interface ProviderIdentity {
  login: string;
  externalId: number;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Normalized developer snapshot fetched from a source provider (GitHub, GitLab).
 * Field names mirror the current `developers` table columns (`github_*`) to
 * keep the DB schema unchanged in Phase 1. Phase 2 introduces provider-agnostic
 * column naming; GitLab values will populate the same fields.
 */
export interface ProviderDeveloperData {
  github_login: string;
  github_id: number;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  contributions: number;
  public_repos: number;
  total_stars: number;
  primary_language: string | null;
  top_repos: TopRepo[];
  github_etag: string | null;
  contributions_total?: number;
  contribution_years?: number[];
  total_prs?: number;
  total_reviews?: number;
  total_issues?: number;
  repos_contributed_to?: number;
  followers?: number;
  following?: number;
  organizations_count?: number;
  account_created_at?: string | null;
  current_streak?: number;
  longest_streak?: number;
  active_days_last_year?: number;
  language_diversity?: number;
  current_week_contributions?: number;
}

export interface FetchOptions {
  allowEmpty?: boolean;
  /**
   * Per-call OAuth access token. When provided, overrides the server-side
   * master token (GITLAB_TOKEN / GITHUB_TOKEN) for endpoints that respect
   * authentication. Used to fetch a user's own data with their session token.
   */
  accessToken?: string;
}

export interface SourceProvider {
  readonly name: ProviderName;
  extractIdentity(userMetadata: Record<string, unknown>): ProviderIdentity | null;
  fetchDeveloperData(login: string, opts?: FetchOptions): Promise<ProviderDeveloperData>;
}

export class ProviderFetchError extends Error {
  code: "not_found" | "organization" | "no_activity" | "rate_limit";
  status: number;
  provider: ProviderName;
  constructor(
    provider: ProviderName,
    code: ProviderFetchError["code"],
    message: string,
    status: number,
  ) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}
