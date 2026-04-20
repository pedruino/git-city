import type { TopRepo } from "@/lib/github";
import {
  ProviderFetchError,
  type ProviderDeveloperData,
  type FetchOptions,
} from "@/lib/providers/types";

const GITLAB_API_BASE = "https://gitlab.com/api/v4";
const FETCH_TIMEOUT_MS = 15_000;

function glHeaders(): HeadersInit {
  const h: HeadersInit = { "User-Agent": "git-city-app" };
  if (process.env.GITLAB_TOKEN) {
    h["PRIVATE-TOKEN"] = process.env.GITLAB_TOKEN;
  }
  return h;
}

interface GitLabUser {
  id: number;
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  followers: number;
  following: number;
  public_email?: string | null;
}

interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path_with_namespace: string;
  star_count: number;
  forks_count: number;
  default_branch: string | null;
  web_url: string;
  forked_from_project?: unknown;
  archived: boolean;
}

interface GitLabEvent {
  created_at: string;
  action_name: string;
}

async function glFetch<T>(path: string): Promise<{ data: T; headers: Headers; status: number }> {
  const res = await fetch(`${GITLAB_API_BASE}${path}`, {
    headers: glHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitLab API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return { data: (await res.json()) as T, headers: res.headers, status: res.status };
}

async function findUserByUsername(username: string): Promise<GitLabUser | null> {
  const { data } = await glFetch<GitLabUser[]>(
    `/users?username=${encodeURIComponent(username)}`,
  );
  return data[0] ?? null;
}

async function fetchUserProjects(userId: number): Promise<GitLabProject[]> {
  const all: GitLabProject[] = [];
  for (let page = 1; page <= 2; page++) {
    const { data } = await glFetch<GitLabProject[]>(
      `/users/${userId}/projects?per_page=100&order_by=star_count&sort=desc&page=${page}`,
    );
    all.push(...data);
    if (data.length < 100) break;
  }
  return all;
}

async function fetchContributionCounts(userId: number): Promise<{
  lastYear: number;
  allTime: number;
  currentWeek: number;
  activeDays: number;
}> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const sinceIso = oneYearAgo.toISOString().slice(0, 10);

  const weekStart = new Date();
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - dow + (dow === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  let lastYear = 0;
  let allTime = 0;
  let currentWeek = 0;
  const activeDaysSet = new Set<string>();

  for (let page = 1; page <= 5; page++) {
    try {
      const { data } = await glFetch<GitLabEvent[]>(
        `/users/${userId}/events?per_page=100&after=${sinceIso}&page=${page}`,
      );
      if (data.length === 0) break;
      for (const ev of data) {
        lastYear++;
        allTime++;
        activeDaysSet.add(ev.created_at.slice(0, 10));
        if (new Date(ev.created_at) >= weekStart) currentWeek++;
      }
      if (data.length < 100) break;
    } catch {
      break;
    }
  }

  return {
    lastYear,
    allTime,
    currentWeek,
    activeDays: activeDaysSet.size,
  };
}

async function fetchGroupCount(userId: number): Promise<number> {
  try {
    const { data } = await glFetch<unknown[]>(`/users/${userId}/memberships?type=Namespace&per_page=100`);
    return data.length;
  } catch {
    return 0;
  }
}

export async function fetchGitLabDeveloperData(
  username: string,
  opts?: FetchOptions,
): Promise<ProviderDeveloperData> {
  const user = await findUserByUsername(username);
  if (!user) {
    throw new ProviderFetchError("gitlab", "not_found", "User not found on GitLab", 404);
  }

  const resolvedLogin = user.username.toLowerCase();

  const [projects, contribs, groupCount] = await Promise.all([
    fetchUserProjects(user.id).catch(() => [] as GitLabProject[]),
    fetchContributionCounts(user.id).catch(() => ({ lastYear: 0, allTime: 0, currentWeek: 0, activeDays: 0 })),
    fetchGroupCount(user.id),
  ]);

  const ownProjects = projects.filter((p) => !p.forked_from_project && !p.archived);
  const totalStars = ownProjects.reduce((s, p) => s + (p.star_count ?? 0), 0);

  const topRepos: TopRepo[] = ownProjects
    .sort((a, b) => b.star_count - a.star_count)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      stars: p.star_count,
      language: null,
      url: p.web_url,
    }));

  if (!opts?.allowEmpty && contribs.lastYear === 0 && ownProjects.length === 0) {
    throw new ProviderFetchError(
      "gitlab",
      "no_activity",
      "This user has no public activity on GitLab yet.",
      400,
    );
  }

  return {
    github_login: resolvedLogin,
    github_id: user.id,
    name: user.name,
    avatar_url: user.avatar_url,
    bio: user.bio,
    contributions: contribs.lastYear,
    public_repos: ownProjects.length,
    total_stars: totalStars,
    primary_language: null,
    top_repos: topRepos,
    github_etag: null,
    contributions_total: contribs.allTime,
    contribution_years: [],
    total_prs: 0,
    total_reviews: 0,
    total_issues: 0,
    repos_contributed_to: 0,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    organizations_count: groupCount,
    account_created_at: user.created_at ?? null,
    current_streak: 0,
    longest_streak: 0,
    active_days_last_year: contribs.activeDays,
    language_diversity: 0,
    current_week_contributions: contribs.currentWeek,
  };
}
