-- 079: Multi-provider support (GitHub + GitLab)
--
-- Adds nullable `provider`, `provider_user_id`, and `provider_username` columns
-- to `developers` so the app can source developer profiles from GitHub OR
-- GitLab (or future providers). Existing `github_*` columns remain populated
-- for backward compatibility — for GitHub rows, the two sets are mirrors.
--
-- Why nullable + default: allows a gradual migration and keeps the schema
-- backward-compatible with code that still reads `github_login`.

ALTER TABLE developers ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'github';
ALTER TABLE developers ADD COLUMN IF NOT EXISTS provider_user_id TEXT;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS provider_username TEXT;

-- Backfill: everyone currently in the table is from GitHub.
UPDATE developers
SET provider_user_id  = COALESCE(provider_user_id,  github_id::text),
    provider_username = COALESCE(provider_username, github_login)
WHERE provider_user_id IS NULL OR provider_username IS NULL;

-- Cross-provider uniqueness: a user can exist once per (provider, username).
-- The existing `github_login UNIQUE` stays — it's only violated if two GitLab
-- users coincidentally match a GitHub login, which we prevent at write time
-- by namespacing or future migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_provider_username
  ON developers (provider, provider_username);

CREATE INDEX IF NOT EXISTS idx_developers_provider
  ON developers (provider);

-- Allow provider to be validated at the DB level
ALTER TABLE developers
  DROP CONSTRAINT IF EXISTS developers_provider_check;
ALTER TABLE developers
  ADD CONSTRAINT developers_provider_check
    CHECK (provider IN ('github', 'gitlab'));
