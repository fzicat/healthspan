-- Training phases: replace the Sept 22-23 training-planning engine with a plain
-- record of past, current and planned phases. Run once in the Supabase SQL editor.
--
-- Part 1 removes every object created by the old 202609220001-0004 migrations
-- (export the old data first). Part 2 creates training_phases, identical to the
-- block at the end of schema.sql. Idempotent: safe to re-run.
BEGIN;

-- Part 1: remove the old engine ------------------------------------------------

-- Triggers the old engine attached to the logging tables.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sets','exercises','workouts','workouts_exercises','daily_logs','cardio_sessions','breathwork_sessions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS training_evidence_changed ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS training_rpc_access ON public.%I', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS training_capture_classification ON public.exercises;
DROP TRIGGER IF EXISTS training_capture_set_classification ON public.sets;

-- Triggers on the engine's own tables (functions and tables depend on each other:
-- drop these triggers, then the functions, then the tables).
DO $$ BEGIN
  IF to_regclass('public.training_plan_state') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS training_state_validate ON public.training_plan_state;
  END IF;
  IF to_regclass('public.training_plan_revisions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS training_revisions_immutable ON public.training_plan_revisions;
  END IF;
  IF to_regclass('public.training_session_contexts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS training_sessions_immutable ON public.training_session_contexts;
  END IF;
  IF to_regclass('public.training_plan_events') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS training_events_immutable ON public.training_plan_events;
  END IF;
END $$;

-- Set-to-session link (drops its FK and index with it).
ALTER TABLE public.sets DROP COLUMN IF EXISTS training_session_id;

-- All engine functions (before tables: some use their row types).
-- Helpers are training_*, RPCs have fixed names.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'training\_%' ESCAPE '\' OR p.proname IN (
      'get_training_context','get_training_history','get_training_request','propose_training_revision',
      'activate_training_revision','set_training_lifecycle','record_training_decision',
      'materialize_training_session','mutate_training_workout'))
      AND p.proname <> 'training_phases_set_updated_at'
  LOOP
    EXECUTE format('DROP FUNCTION %s', f.signature);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.training_plan_events, public.training_session_contexts,
  public.training_plan_revisions, public.training_plan_state;

-- The dedicated RPC owner role. Harmless if the SQL editor role may not drop it:
-- it is NOLOGIN and, after this, owns nothing and holds no privileges.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'training_rpc_owner') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM training_rpc_owner;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM training_rpc_owner;
    REVOKE ALL ON SCHEMA public FROM training_rpc_owner;
    BEGIN
      DROP ROLE training_rpc_owner;
    EXCEPTION WHEN insufficient_privilege OR dependent_objects_still_exist THEN
      RAISE NOTICE 'training_rpc_owner kept (%): inert NOLOGIN role, drop later if desired', SQLERRM;
    END;
  END IF;
END $$;

-- Part 2: training phases -------------------------------------------------------

-- One row per training phase. Exactly one phase may be `current`; the AI coach
-- (via MCP) owns the content, the app only displays it.
CREATE TABLE IF NOT EXISTS public.training_phases (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'current', 'completed')),
    start_date DATE,
    end_date DATE,
    goal TEXT,
    plan TEXT,
    outcome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT training_phases_dates_ordered CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS training_phases_one_current ON public.training_phases ((true)) WHERE status = 'current';
CREATE OR REPLACE FUNCTION public.training_phases_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS training_phases_updated_at ON public.training_phases;
CREATE TRIGGER training_phases_updated_at
    BEFORE UPDATE ON public.training_phases
    FOR EACH ROW EXECUTE FUNCTION public.training_phases_set_updated_at();
ALTER TABLE public.training_phases ENABLE ROW LEVEL SECURITY;
-- The app is read-only for phases; writes go through the service-role MCP server.
DROP POLICY IF EXISTS "Allow authenticated users to read training_phases" ON public.training_phases;
CREATE POLICY "Allow authenticated users to read training_phases" ON public.training_phases FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.training_phases TO authenticated;
GRANT ALL ON public.training_phases TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.training_phases_id_seq TO service_role;

COMMIT;
