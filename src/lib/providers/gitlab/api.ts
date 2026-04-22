import type { TopRepo } from "@/lib/github";
import {
  ProviderFetchError,
  type ProviderDeveloperData,
  type FetchOptions,
} from "@/lib/providers/types";

const GITLAB_API_BASE = "https://gitlab.com/api/v4";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Optional post-fetch scaling. calendar.json already returns real contribution
 * counts (same as the profile heatmap), so the default is 1. Override via
 * GITLAB_CONTRIBUTION_MULTIPLIER only if you need to shift the visual scale.
 */
function contributionMultiplier(): number {
  const raw = parseFloat(process.env.GITLAB_CONTRIBUTION_MULTIPLIER ?? "1");
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function glHeaders(accessToken?: string): HeadersInit {
  const h: HeadersInit = { "User-Agent": "git-city-app" };
  // Per-call OAuth token (from user's Supabase session) wins over the
  // server-side master token. Falls back to master for server-initiated calls
  // with no active user.
  if (accessToken) {
    h["Authorization"] = `Bearer ${accessToken}`;
  } else if (process.env.GITLAB_TOKEN) {
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

async function glFetch<T>(path: string, accessToken?: string): Promise<{ data: T; headers: Headers; status: number }> {
  const res = await fetch(`${GITLAB_API_BASE}${path}`, {
    headers: glHeaders(accessToken),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitLab API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return { data: (await res.json()) as T, headers: res.headers, status: res.status };
}

async function findUserByUsername(username: string, accessToken?: string): Promise<GitLabUser | null> {
  const { data } = await glFetch<GitLabUser[]>(
    `/users?username=${encodeURIComponent(username)}`,
    accessToken,
  );
  return data[0] ?? null;
}

async function fetchUserProjects(userId: number, accessToken?: string): Promise<GitLabProject[]> {
  // Fetch pages 1 and 2 in parallel. Most users have < 100 projects, so page 2
  // returns [] quickly; for power users we halve the wall time vs. the serial
  // "await page 1, then decide" loop. Sorted by star_count desc, so truncating
  // after 200 is acceptable.
  const fetchPage = (page: number) =>
    glFetch<GitLabProject[]>(
      `/users/${userId}/projects?per_page=100&order_by=star_count&sort=desc&page=${page}`,
      accessToken,
    ).then((r) => r.data);

  const [p1, p2] = await Promise.all([fetchPage(1), fetchPage(2)]);
  return [...p1, ...p2];
}

/**
 * GitLab's public profile calendar exposes per-day contribution counts as JSON
 * at /users/:username/calendar.json — same data rendered on the profile page.
 * This is the same source the GitLab UI uses, no API token required for public
 * profiles. Returns up to 12 months of daily totals.
 */
async function fetchContributionCounts(username: string): Promise<{
  lastYear: number;
  allTime: number;
  currentWeek: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
}> {
  const host = "https://gitlab.com";
  const res = await fetch(`${host}/users/${encodeURIComponent(username)}/calendar.json`, {
    headers: glHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { lastYear: 0, allTime: 0, currentWeek: 0, activeDays: 0, currentStreak: 0, longestStreak: 0 };
  }
  const calendar = (await res.json()) as Record<string, number>;

  const weekStart = new Date();
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - dow + (dow === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  let lastYear = 0;
  let currentWeek = 0;
  let activeDays = 0;

  // Build a dense day-by-day array for the last 365 days (calendar.json only
  // contains days with activity; missing days = 0 and must reset the streak).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Array<{ date: string; n: number }> = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const n = calendar[iso] ?? 0;
    days.push({ date: iso, n });
  }

  for (const { date, n } of days) {
    if (n > 0) {
      lastYear += n;
      activeDays++;
      if (new Date(date) >= weekStart) currentWeek += n;
    }
  }

  // Longest streak: max run of consecutive days with n > 0.
  let longestStreak = 0;
  let run = 0;
  for (const { n } of days) {
    if (n > 0) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 0;
    }
  }

  // Current streak: walk backwards from today; if today has 0 but yesterday
  // has activity, skip today (commits may not have happened yet).
  let currentStreak = 0;
  const todayIso = today.toISOString().slice(0, 10);
  const yesterdayIso = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  for (let i = days.length - 1; i >= 0; i--) {
    const { date, n } = days[i];
    if (i === days.length - 1 && n === 0 && (date === todayIso || date === yesterdayIso)) continue;
    if (n > 0) currentStreak++;
    else break;
  }

  return {
    lastYear,
    allTime: lastYear, // calendar.json only returns ~1 year; close enough.
    currentWeek,
    activeDays,
    currentStreak,
    longestStreak,
  };
}

async function fetchGroupCount(userId: number, accessToken?: string): Promise<number> {
  try {
    const { data } = await glFetch<unknown[]>(
      `/users/${userId}/memberships?type=Namespace&per_page=100`,
      accessToken,
    );
    return data.length;
  } catch {
    return 0;
  }
}

export async function fetchGitLabDeveloperData(
  username: string,
  opts?: FetchOptions,
): Promise<ProviderDeveloperData> {
  const accessToken = opts?.accessToken;
  const user = await findUserByUsername(username, accessToken);
  if (!user) {
    throw new ProviderFetchError("gitlab", "not_found", "User not found on GitLab", 404);
  }

  const resolvedLogin = user.username.toLowerCase();

  // calendar.json ignores auth headers entirely (it's a UI endpoint that only
  // respects session cookies). We don't pass the token — data is public-only,
  // and the user must enable "Include private contributions on my profile"
  // in their GitLab settings for private repo activity to show up.
  const [projects, contribs, groupCount] = await Promise.all([
    fetchUserProjects(user.id, accessToken).catch(() => [] as GitLabProject[]),
    fetchContributionCounts(resolvedLogin).catch(() => ({
      lastYear: 0,
      allTime: 0,
      currentWeek: 0,
      activeDays: 0,
      currentStreak: 0,
      longestStreak: 0,
    })),
    fetchGroupCount(user.id, accessToken),
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

  // Scale GitLab events → GitHub-comparable commits (see multiplier doc above).
  const mult = contributionMultiplier();
  const scaledContribs = Math.round(contribs.lastYear * mult);
  const scaledAllTime = Math.round(contribs.allTime * mult);
  const scaledWeek = Math.round(contribs.currentWeek * mult);

  return {
    github_login: resolvedLogin,
    github_id: user.id,
    name: user.name,
    avatar_url: user.avatar_url,
    bio: user.bio,
    contributions: scaledContribs,
    public_repos: ownProjects.length,
    total_stars: totalStars,
    primary_language: null,
    top_repos: topRepos,
    github_etag: null,
    contributions_total: scaledAllTime,
    contribution_years: [],
    total_prs: 0,
    total_reviews: 0,
    total_issues: 0,
    repos_contributed_to: 0,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    organizations_count: groupCount,
    account_created_at: user.created_at ?? null,
    current_streak: contribs.currentStreak,
    longest_streak: contribs.longestStreak,
    active_days_last_year: contribs.activeDays,
    language_diversity: 0,
    current_week_contributions: scaledWeek,
  };
}
