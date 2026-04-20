-- 073: Comprehensive security hardening
-- Fixes all issues flagged by Supabase security advisor

BEGIN;

-- ============================================================================
-- PART 1: Enable RLS on all unprotected public tables
-- All 8 tables are accessed exclusively via getSupabaseAdmin() (service_role)
-- which bypasses RLS, so no policies needed.
-- ============================================================================

-- Sensitive: emails, webhook_secrets
ALTER TABLE advertiser_accounts ENABLE ROW LEVEL SECURITY;

-- Sensitive: session tokens (allows session hijacking if exposed)
ALTER TABLE advertiser_sessions ENABLE ROW LEVEL SECURITY;

-- Sensitive: API key hashes
ALTER TABLE advertiser_api_keys ENABLE ROW LEVEL SECURITY;

-- Sensitive: session_ids
ALTER TABLE site_visitors ENABLE ROW LEVEL SECURITY;

-- Reference data, but no client-side reads (API uses admin client)
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE district_changes ENABLE ROW LEVEL SECURITY;

-- Internal tracking tables
ALTER TABLE milestone_celebrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 2: Fix developer_sessions broken policy
-- "Service role manages sessions" uses USING(true) WITH CHECK(true) for ALL
-- roles, which completely defeats RLS. Service role already bypasses RLS,
-- so this policy only opens the door for anon/authenticated.
-- ============================================================================

DROP POLICY IF EXISTS "Service role manages sessions" ON developer_sessions;


-- ============================================================================
-- PART 3: Fix survey_responses user_metadata vulnerability
-- Existing policies use auth.jwt()->'user_metadata'->>'user_name' which is
-- EDITABLE by end users — anyone can forge their github_login in metadata.
-- Fix: use developers.claimed_by = auth.uid() which is tamper-proof.
-- ============================================================================

DROP POLICY IF EXISTS "Users can submit their own response" ON survey_responses;
DROP POLICY IF EXISTS "Users can read their own responses" ON survey_responses;

CREATE POLICY "Users can submit their own response" ON survey_responses
  FOR INSERT
  WITH CHECK (
    developer_id = (
      SELECT id FROM public.developers
      WHERE claimed_by = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Users can read their own responses" ON survey_responses
  FOR SELECT
  USING (
    developer_id = (
      SELECT id FROM public.developers
      WHERE claimed_by = auth.uid()
      LIMIT 1
    )
  );


-- ============================================================================
-- PART 4: Revoke materialized view access from PostgREST API
-- sky_ad_daily_stats and sky_ad_conversion_daily_stats expose ad analytics
-- to anon/authenticated. All access goes through RPC functions via service_role.
-- ============================================================================

REVOKE SELECT ON sky_ad_daily_stats FROM anon, authenticated;
REVOKE SELECT ON sky_ad_conversion_daily_stats FROM anon, authenticated;


-- ============================================================================
-- PART 5: Set search_path on all functions missing it
-- SECURITY DEFINER functions without search_path are vulnerable to
-- search_path injection (attacker creates objects in a schema that gets
-- searched before 'public'). Using 'public' instead of '' to avoid
-- rewriting all function bodies with fully-qualified names.
-- ============================================================================

-- SECURITY DEFINER + SECURITY INVOKER functions
-- Wrapped in DO block with EXCEPTION handling to skip functions that were
-- dropped in earlier migrations (e.g. endorsements in 060).
DO $$
DECLARE
  sig TEXT;
  signatures TEXT[] := ARRAY[
    'assign_new_dev_rank(bigint)',
    'credit_pixels(bigint, bigint, text, text, text, text, text, inet, text)',
    'deactivate_expired_ads()',
    'debit_pixels(bigint, bigint, text, text, text, text)',
    'earn_pixels(bigint, text, text, text, text)',
    'find_auth_user_by_github_login(text)',
    'get_ad_daily_stats(date, date, text[])',
    'get_ad_stats(date, date, text[])',
    'get_auth_users_without_developer()',
    'heartbeat_visitor(text)',
    'increment_hired_count(uuid)',
    'increment_job_counter(uuid, text)',
    'increment_kudos_count(bigint)',
    'increment_referral_count(bigint)',
    'increment_visit_count(bigint)',
    'recalculate_ranks()',
    'refresh_sky_ad_stats()',
    'spend_pixels(bigint, text, text, bigint, boolean, inet, text)',
    'upsert_arcade_visit(uuid, uuid)',
    'complete_all_dailies(bigint)',
    'count_devs_with_more_achievements(bigint)',
    'grant_streak_freeze(bigint)',
    'grant_xp(bigint, text, integer)',
    'increment_kudos_week(bigint, bigint)',
    'perform_checkin(bigint)',
    'prevent_ledger_mutation()',
    'record_mission_progress(bigint, text, integer, integer)',
    'refresh_weekly_kudos()',
    'top_achievers(integer)',
    'update_arcade_rooms_updated_at()',
    'update_job_updated_at()'
  ];
BEGIN
  FOREACH sig IN ARRAY signatures LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %L', sig, 'public');
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skipping ALTER (function not found): %', sig;
    END;
  END LOOP;
END; $$;


-- ============================================================================
-- PART 6: Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated
-- All 20 are called exclusively via getSupabaseAdmin() (service_role), which
-- bypasses privilege checks. Revoking prevents direct PostgREST RPC abuse
-- where anon users could call functions like credit_pixels, recalculate_ranks,
-- find_auth_user_by_github_login (which accesses auth.users!), etc.
-- ============================================================================

-- Must revoke from PUBLIC (not just anon/authenticated) because PostgreSQL
-- grants EXECUTE to PUBLIC by default on all functions, and named roles inherit it.
-- Wrapped in DO block with EXCEPTION handling to skip missing functions.
DO $$
DECLARE
  sig TEXT;
  signatures TEXT[] := ARRAY[
    'assign_new_dev_rank(bigint)',
    'credit_pixels(bigint, bigint, text, text, text, text, text, inet, text)',
    'deactivate_expired_ads()',
    'debit_pixels(bigint, bigint, text, text, text, text)',
    'earn_pixels(bigint, text, text, text, text)',
    'find_auth_user_by_github_login(text)',
    'get_ad_daily_stats(date, date, text[])',
    'get_ad_stats(date, date, text[])',
    'get_auth_users_without_developer()',
    'heartbeat_visitor(text)',
    'increment_hired_count(uuid)',
    'increment_job_counter(uuid, text)',
    'increment_kudos_count(bigint)',
    'increment_referral_count(bigint)',
    'increment_visit_count(bigint)',
    'recalculate_ranks()',
    'refresh_sky_ad_stats()',
    'spend_pixels(bigint, text, text, bigint, boolean, inet, text)',
    'upsert_arcade_visit(uuid, uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY signatures LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skipping REVOKE (function not found): %', sig;
    END;
  END LOOP;
END; $$;


-- ============================================================================
-- PART 7: Drop duplicate index
-- idx_dev_achievements_dev and idx_dev_achievements_dev_id are identical
-- (both btree on developer_id). Keeping the more descriptive name.
-- ============================================================================

DROP INDEX IF EXISTS idx_dev_achievements_dev;

COMMIT;
