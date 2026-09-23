-- Manual, administrator-only initial provisioning; not a migration or activation.
-- Run ONLY after all four reviewed migrations and SQL-RUNBOOK.md postchecks pass.
-- Frank must look up the exact auth.users UUID himself in the intended project:
--   SELECT id, email, created_at FROM auth.users
--   WHERE email = 'REPLACE_WITH_EXACT_CONFIRMED_LOGIN_EMAIL';
-- Stop unless exactly one intended account is identified. Never use the first user,
-- a fixture UUID, a service-role subject, or an agent's guess. Do not share credentials.
-- Replace owner_uuid_text below, confirm the IANA zone, and set zone_confirmed=true.
-- The untouched template FAILS CLOSED. No pre-existing state/history is overwritten.
-- On any error, execute ROLLBACK; before another attempt in that editor session.
BEGIN;
DO $provision$
DECLARE
  owner_uuid_text constant text := 'REPLACE_WITH_AUTH_USERS_UUID';
  athlete_zone constant text := 'America/Montreal';
  zone_confirmed constant boolean := false;
  owner_uuid uuid;
BEGIN
  -- Validate the literal BEFORE casting or querying; do not normalize bad input.
  IF owner_uuid_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR owner_uuid_text = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'OWNER_SETUP_REQUIRED: supply the exact confirmed auth.users UUID';
  END IF;
  owner_uuid := owner_uuid_text::uuid;
  IF NOT zone_confirmed OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = athlete_zone
  ) THEN
    RAISE EXCEPTION 'OWNER_SETUP_REQUIRED: explicitly confirm a valid IANA athlete timezone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = owner_uuid) THEN
    RAISE EXCEPTION 'OWNER_SETUP_REQUIRED: UUID does not exist in auth.users';
  END IF;
  -- Serialize competing setup attempts. This short transaction is administrator-only.
  LOCK TABLE public.training_plan_state IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.training_plan_state)
     OR EXISTS (SELECT 1 FROM public.training_plan_revisions)
     OR EXISTS (SELECT 1 FROM public.training_session_contexts)
     OR EXISTS (SELECT 1 FROM public.training_plan_events)
     OR EXISTS (SELECT 1 FROM public.sets WHERE training_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'OWNER_SETUP_REFUSED: existing planning state/history/links; inspect, do not reset';
  END IF;
  INSERT INTO public.training_plan_state
    (id, owner_user_id, athlete_timezone, lifecycle, active_revision_id,
     state_version, evidence_version)
  VALUES (1, owner_uuid, athlete_zone, 'inactive', NULL, 0, 0);
END
$provision$;
COMMIT;

-- Read back the exact singleton. Expected: confirmed UUID/zone, inactive, NULL
-- active_revision_id, zero counters before concurrent legacy activity resumes.
SELECT id, owner_user_id, athlete_timezone, lifecycle, active_revision_id,
       state_version, evidence_version
FROM public.training_plan_state WHERE id = 1;
-- Expected zero: provisioning never associates legacy sets or invents history.
SELECT
  (SELECT count(*) FROM public.training_plan_revisions) AS revision_count,
  (SELECT count(*) FROM public.training_session_contexts) AS session_count,
  (SELECT count(*) FROM public.training_plan_events) AS event_count,
  (SELECT count(*) FROM public.sets WHERE training_session_id IS NOT NULL) AS linked_set_count;
