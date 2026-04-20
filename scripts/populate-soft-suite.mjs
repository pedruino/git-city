// Populate git-city with 50 soft-suite members using the authenticated
// /users/:id/events endpoint — respects token's access to private projects.
//
// Docs: https://docs.gitlab.com/api/events/#retrieve-contribution-events-for-a-user

const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const SUPABASE_URL = "https://xwmcwicxcbakstrzdisn.supabase.co";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROUP_ID = 125112532;
const TARGET = parseInt(process.env.TARGET ?? "2000", 10);
const MULTIPLIER = 4;

if (!GITLAB_TOKEN) { console.error("GITLAB_TOKEN not set"); process.exit(1); }

const ghHeaders = { "PRIVATE-TOKEN": GITLAB_TOKEN, "User-Agent": "git-city-populator" };
const sbHeaders = { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, "Content-Type": "application/json" };

async function fetchAllMembers() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`https://gitlab.com/api/v4/groups/${GROUP_ID}/members/all?per_page=100&page=${page}`, { headers: ghHeaders });
    if (!res.ok) break;
    const data = await res.json();
    if (data.length === 0) break;
    all.push(...data);
    if (data.length < 100) break;
  }
  return all.filter(m => m.state === "active" && !m.username.endsWith("_bot"));
}

async function fetchEvents(userId) {
  const events = [];
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const after = oneYearAgo.toISOString().slice(0, 10);
  for (let page = 1; page <= 10; page++) {
    try {
      const res = await fetch(
        `https://gitlab.com/api/v4/users/${userId}/events?per_page=100&after=${after}&page=${page}`,
        { headers: ghHeaders }
      );
      if (!res.ok) break;
      const data = await res.json();
      if (data.length === 0) break;
      events.push(...data);
      if (data.length < 100) break;
    } catch { break; }
  }
  return events;
}

async function fetchProjects(userId) {
  try {
    const res = await fetch(
      `https://gitlab.com/api/v4/users/${userId}/projects?per_page=50&order_by=star_count&sort=desc`,
      { headers: ghHeaders }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function computeStats(events) {
  const byDay = new Map();
  for (const ev of events) {
    const day = ev.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const days = [...byDay.keys()].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    if (prev) {
      const diff = Math.round((new Date(d) - new Date(prev)) / 86400000);
      if (diff === 1) run++;
      else { longest = Math.max(longest, run); run = 1; }
    } else run = 1;
    prev = d;
  }
  longest = Math.max(longest, run);
  // Current streak: walk backwards from today.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (i === days.length - 1 && d !== today && d !== yesterday) break;
    const prevDay = days[i - 1];
    current++;
    if (!prevDay) break;
    const diff = Math.round((new Date(d) - new Date(prevDay)) / 86400000);
    if (diff !== 1) break;
  }
  return { lastYear: events.length, activeDays: byDay.size, longest, current };
}

async function upsertDev(member, stats, projects) {
  const scaled = Math.round(stats.lastYear * MULTIPLIER);
  const own = projects.filter(p => !p.forked_from_project && !p.archived);
  const totalStars = own.reduce((s, p) => s + (p.star_count ?? 0), 0);
  const topRepos = own.sort((a, b) => b.star_count - a.star_count).slice(0, 5).map(p => ({
    name: p.name, stars: p.star_count, language: null, url: p.web_url,
  }));

  const record = {
    github_login: member.username.toLowerCase(),
    github_id: member.id,
    name: member.name ?? member.username,
    avatar_url: member.avatar_url,
    bio: null,
    contributions: scaled,
    public_repos: own.length,
    total_stars: totalStars,
    primary_language: null,
    top_repos: topRepos,
    contributions_total: scaled,
    total_prs: 0, total_reviews: 0, total_issues: 0,
    repos_contributed_to: 0, followers: 0, following: 0,
    organizations_count: 1,
    current_streak: stats.current,
    longest_streak: stats.longest,
    active_days_last_year: stats.activeDays,
    language_diversity: 0,
    current_week_contributions: 0,
    provider: "gitlab",
    provider_user_id: String(member.id),
    provider_username: member.username.toLowerCase(),
    fetched_at: new Date().toISOString(),
    claimed: false,
    fetch_priority: 2,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/developers?on_conflict=github_login`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(record),
  });
  if (!res.ok) console.error(`    upsert ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.ok;
}

(async () => {
  console.log("Fetching all soft-suite members…");
  const members = await fetchAllMembers();
  console.log(`Total active humans: ${members.length}`);
  console.log(`Target: create ${TARGET} devs\n`);

  let created = 0, skipped = 0, processed = 0;
  for (const m of members) {
    if (created >= TARGET) break;
    processed++;
    process.stdout.write(`[${String(processed).padStart(3)}|+${created}] ${m.username.padEnd(34)} `);
    const events = await fetchEvents(m.id);
    if (events.length === 0) { console.log("0 events"); skipped++; continue; }
    const stats = computeStats(events);
    const projects = await fetchProjects(m.id);
    const ok = await upsertDev(m, stats, projects);
    console.log(`events=${stats.lastYear.toString().padStart(4)}  active=${stats.activeDays}d  longest=${stats.longest}d  projects=${projects.length}  ${ok ? "✅" : "❌"}`);
    if (ok) created++; else skipped++;
    await new Promise(r => setTimeout(r, 120));
  }
  console.log(`\nDone. Created=${created}, Skipped=${skipped}, Processed=${processed}`);
})();
