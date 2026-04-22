import { appConfig } from "@/lib/app-config";

interface AppCreditProps {
  accent: string;
  className?: string;
  /** "built" (default) or "Built" for sentence-start placement. */
  variant?: "lower" | "upper";
}

/**
 * Single source of truth for the "built by @author · fork by @fork" credit line.
 * Preserves the upstream IP attribution (required by the original license) while
 * surfacing that this deploy is a maintained fork.
 *
 * Configure via env:
 *   NEXT_PUBLIC_AUTHOR_HANDLE / _URL   → upstream author (defaults to srizzon)
 *   NEXT_PUBLIC_FORK_HANDLE  / _URL   → fork maintainer (optional — hidden if unset)
 */
export default function AppCredit({
  accent,
  className = "text-[9px] text-muted normal-case",
  variant = "lower",
}: AppCreditProps) {
  const builtLabel = variant === "upper" ? "Built by" : "built by";

  return (
    <p className={className}>
      {builtLabel}{" "}
      <a
        href={appConfig.authorUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-cream"
        style={{ color: accent }}
      >
        @{appConfig.authorHandle}
      </a>
      {appConfig.forkHandle && (
        <>
          {` · ${appConfig.forkLabel} `}
          <a
            href={appConfig.forkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-cream"
            style={{ color: accent }}
          >
            @{appConfig.forkHandle}
          </a>
        </>
      )}
    </p>
  );
}
