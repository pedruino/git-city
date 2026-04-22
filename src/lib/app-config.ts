// Branding / author configuration — env-driven so forks can rebrand without
// touching code. All are OPTIONAL; when unset, we fall back to the upstream
// defaults (Samuel Rizzon's personal brand).

export const appConfig = {
  /** Name of the person/org credited as "built by" in the UI. */
  authorName: process.env.NEXT_PUBLIC_AUTHOR_NAME ?? "Samuel Rizzon",
  /** Handle (without @) shown as "built by @x". */
  authorHandle: process.env.NEXT_PUBLIC_AUTHOR_HANDLE ?? "samuelrizzondev",
  /** Full URL of the author's social profile (X/Twitter, Bluesky, LinkedIn). */
  authorUrl: process.env.NEXT_PUBLIC_AUTHOR_URL ?? "https://x.com/samuelrizzondev",
  /** Upstream repo URL (★ badge, "Star us on GitHub" CTA). */
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/pedruino/git-city",
  /** Discord server invite. */
  discordUrl: process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/2bTjFAkny7",
  /** Fork-maintainer handle shown alongside the upstream credit. Optional. */
  forkHandle: process.env.NEXT_PUBLIC_FORK_HANDLE ?? "pedruino",
  /** Fork-maintainer profile URL. */
  forkUrl: process.env.NEXT_PUBLIC_FORK_URL ?? "https://github.com/pedruino",
  /**
   * Label used between the upstream author and the fork maintainer.
   * Conveys the scope of the fork work. Defaults to "customized & maintained by".
   * Examples: "maintained by", "extended by", "Softplan edition by".
   */
  forkLabel: process.env.NEXT_PUBLIC_FORK_LABEL ?? "customized & maintained by",
};
