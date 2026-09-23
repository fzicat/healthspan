-- Additive migration 4/4. Narrow RPC role, explicit grants, no owner provisioning.
BEGIN;
-- Existing broad legacy policies remain a documented single-user limitation.
GRANT SELECT ON public.exercises,public.sets,public.workouts,public.workouts_exercises,public.daily_logs,public.cardio_sessions,public.breathwork_sessions TO training_rpc_owner;
GRANT INSERT,UPDATE,DELETE ON public.workouts,public.workouts_exercises TO training_rpc_owner;
GRANT UPDATE(training_session_id) ON public.sets TO training_rpc_owner;
GRANT USAGE,SELECT ON SEQUENCE public.workouts_id_seq,public.workouts_exercises_id_seq TO training_rpc_owner;
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['exercises','sets','workouts','workouts_exercises','daily_logs','cardio_sessions','breathwork_sessions'] LOOP
  EXECUTE format('CREATE POLICY training_rpc_access ON public.%I FOR ALL TO training_rpc_owner USING (true) WITH CHECK (true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT ON TABLE public.%I TO training_rpc_owner',t);
  EXECUTE format('CREATE POLICY training_rpc_access ON public.%I FOR ALL TO training_rpc_owner USING (true) WITH CHECK (true)',t);
 END LOOP;
 GRANT UPDATE ON public.training_plan_state TO training_rpc_owner;
 -- Make function ownership changes explicit and limited to this feature.
 -- Temporarily allow ownership transfer, then remove schema-create capability.
 GRANT CREATE ON SCHEMA public TO training_rpc_owner;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'training\_%' ESCAPE '\' OR p.proname IN ('get_training_context','get_training_history','get_training_request','propose_training_revision','activate_training_revision','set_training_lifecycle','record_training_decision','materialize_training_session','mutate_training_workout')) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO training_rpc_owner',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
 REVOKE CREATE ON SCHEMA public FROM training_rpc_owner;
END $$;
GRANT EXECUTE ON FUNCTION public.get_training_context(jsonb),public.get_training_history(jsonb),public.get_training_request(jsonb),public.propose_training_revision(jsonb),public.activate_training_revision(jsonb),public.set_training_lifecycle(jsonb),public.record_training_decision(jsonb),public.materialize_training_session(jsonb),public.mutate_training_workout(jsonb) TO authenticated,service_role;
-- Service-role grants do not authorize athlete-only actions: exact caller/JWT
-- and provisioned owner are checked inside each RPC. No PUBLIC helper execution.
COMMIT;
