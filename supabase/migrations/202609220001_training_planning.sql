-- Additive migration 1/4. Apply once, in filename order, as a schema administrator.
-- Deliberately NOT IF NOT EXISTS: a partial/different installation must fail closed.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.sets') IS NULL OR to_regclass('public.cardio_sessions') IS NULL
 OR to_regclass('auth.users') IS NULL OR to_regclass('public.workouts_exercises') IS NULL THEN
  RAISE EXCEPTION 'TRAINING_PREFLIGHT_REQUIRED: legacy schema/auth missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workouts_exercises' AND column_name='note') THEN
  RAISE EXCEPTION 'TRAINING_PREFLIGHT_REQUIRED: legacy workout note migration missing';
 END IF;
 -- Refuse schema drift rather than partially installing functions over an
 -- incompatible bootstrap. These checks never mutate historical log rows.
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('exercises','id','integer'),('exercises','name','text'),('exercises','category','text'),('exercises','metrics','jsonb'),('exercises','is_deleted','boolean'),
   ('sets','id','integer'),('sets','exercise_id','integer'),('sets','logged_at','timestamp with time zone'),('sets','weight','integer'),('sets','reps','integer'),('sets','time','integer'),('sets','distance','integer'),('sets','rir','integer'),('sets','is_deleted','boolean'),
   ('workouts','id','integer'),('workouts','date','date'),('workouts','name','text'),('workouts','note','text'),
   ('workouts_exercises','id','integer'),('workouts_exercises','workout_id','integer'),('workouts_exercises','exercise_id','integer'),('workouts_exercises','sort_order','integer'),('workouts_exercises','details','text'),('workouts_exercises','note','text'),
   ('daily_logs','date','date'),('cardio_sessions','id','integer'),('cardio_sessions','exercise_id','integer'),('cardio_sessions','date','date'),('cardio_sessions','duration_minutes','integer'),('cardio_sessions','perceived_intensity','integer'),('cardio_sessions','is_deleted','boolean'),('breathwork_sessions','id','integer'),('breathwork_sessions','date','date'),('breathwork_sessions','is_deleted','boolean')
  ) expected(tbl,col,typ)
  LEFT JOIN information_schema.columns actual ON actual.table_schema='public' AND actual.table_name=expected.tbl AND actual.column_name=expected.col
  WHERE actual.data_type IS DISTINCT FROM expected.typ
 ) THEN RAISE EXCEPTION 'TRAINING_PREFLIGHT_REQUIRED: legacy column/type mismatch'; END IF;
 IF to_regclass('public.workouts_id_seq') IS NULL OR to_regclass('public.workouts_exercises_id_seq') IS NULL THEN RAISE EXCEPTION 'TRAINING_PREFLIGHT_REQUIRED: legacy sequence names differ'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum] WHERE c.conrelid='public.workouts'::regclass AND c.contype='u' AND a.attname='date') THEN RAISE EXCEPTION 'TRAINING_PREFLIGHT_REQUIRED: workouts date uniqueness missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'training\_%' ESCAPE '\' OR p.proname IN ('get_training_context','get_training_history','get_training_request','propose_training_revision','activate_training_revision','set_training_lifecycle','record_training_decision','materialize_training_session','mutate_training_workout'))) THEN RAISE EXCEPTION 'TRAINING_PREFLIGHT_REQUIRED: reserved function already exists; do not rerun'; END IF;
END $$;
CREATE ROLE training_rpc_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
-- Supabase's applying administrator is not necessarily a PostgreSQL superuser.
-- The new role is never granted to anon/authenticated/service_role.
DO $$ BEGIN EXECUTE format('GRANT training_rpc_owner TO %I', current_user); END $$;
GRANT USAGE ON SCHEMA public TO training_rpc_owner;
CREATE TABLE public.training_plan_state (
 id integer PRIMARY KEY CHECK(id=1),
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 athlete_timezone text NOT NULL DEFAULT 'America/Montreal',
 lifecycle text NOT NULL DEFAULT 'inactive' CHECK(lifecycle IN ('inactive','active','paused','archived')),
 active_revision_id uuid,
 state_version bigint NOT NULL DEFAULT 0 CHECK(state_version>=0),
 evidence_version bigint NOT NULL DEFAULT 0 CHECK(evidence_version>=0)
);
CREATE TABLE public.training_plan_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state_id integer NOT NULL DEFAULT 1 REFERENCES public.training_plan_state(id),
 parent_revision_id uuid REFERENCES public.training_plan_revisions(id), schema_version integer NOT NULL CHECK(schema_version=1),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'), authored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 authored_on date NOT NULL, timezone text NOT NULL, source text NOT NULL CHECK(source IN ('owner','coach')),
 UNIQUE(state_id,id)
);
ALTER TABLE public.training_plan_state ADD CONSTRAINT training_active_revision_fk
 FOREIGN KEY(id,active_revision_id) REFERENCES public.training_plan_revisions(state_id,id);
CREATE TABLE public.training_session_contexts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state_id integer NOT NULL DEFAULT 1 REFERENCES public.training_plan_state(id),
 revision_id uuid NOT NULL REFERENCES public.training_plan_revisions(id), slot_key text, cycle_key uuid NOT NULL,
 planned_date date NOT NULL, timezone text NOT NULL, activity_kind text NOT NULL CHECK(activity_kind IN ('strength','cardio','mobility','rest')),
 load_tags jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(load_tags)='array'), resistance_slot_key text,
 workout_id integer REFERENCES public.workouts(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), origin text NOT NULL CHECK(origin IN ('prescribed','retrospective')),
 source_state_version bigint NOT NULL, source_evidence_version bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX training_sessions_date ON public.training_session_contexts(planned_date,id);
CREATE TABLE public.training_plan_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state_id integer NOT NULL DEFAULT 1 REFERENCES public.training_plan_state(id),
 kind text NOT NULL CHECK(kind IN ('proposal','activation','lifecycle','reconcile','recommendation','review_due','review','bounded_continuation','concern','deviation','cancel_session','queue_correction','clarify_session','propose_report','confirm_report','confirm_day','attribute_occurrence','resolve_report','rejection','load_classification','mutation_receipt')),
 revision_id uuid REFERENCES public.training_plan_revisions(id), session_id uuid REFERENCES public.training_session_contexts(id),
 payload jsonb NOT NULL DEFAULT '{}', actor text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 occurred_on date NOT NULL, timezone text NOT NULL,
 request_id uuid, operation text, request_digest text, result jsonb,
 CHECK ((request_id IS NULL AND operation IS NULL AND request_digest IS NULL AND result IS NULL)
 OR (request_id IS NOT NULL AND operation IS NOT NULL AND request_digest IS NOT NULL AND result IS NOT NULL)),
 UNIQUE(actor,request_id)
);
CREATE INDEX training_events_session ON public.training_plan_events(session_id,occurred_at,id);
CREATE INDEX training_events_revision ON public.training_plan_events(revision_id,occurred_at,id);
ALTER TABLE public.sets ADD COLUMN training_session_id uuid REFERENCES public.training_session_contexts(id) ON DELETE RESTRICT;
CREATE INDEX sets_training_session ON public.sets(training_session_id) WHERE training_session_id IS NOT NULL;

CREATE FUNCTION public.training_fail(code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RAISE EXCEPTION '%',code USING ERRCODE='P0001'; END $$;
CREATE FUNCTION public.training_date(v text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE d date;
BEGIN
 IF v IS NULL OR v !~ '^\d{4}-\d{2}-\d{2}$' THEN PERFORM public.training_fail('INVALID_DATE'); END IF;
 BEGIN d:=v::date; EXCEPTION WHEN others THEN PERFORM public.training_fail('INVALID_DATE'); END;
 IF to_char(d,'YYYY-MM-DD')<>v THEN PERFORM public.training_fail('INVALID_DATE'); END IF;
 RETURN d;
END $$;
CREATE FUNCTION public.training_actor(owner_only boolean DEFAULT false) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE claims jsonb; uid uuid; owner_id uuid; caller text;
BEGIN
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 caller:=current_setting('role',true);
 IF caller='service_role' AND claims->>'role'='service_role' AND NOT owner_only THEN RETURN 'coach'; END IF;
 IF caller<>'authenticated' OR claims->>'role' IS DISTINCT FROM 'authenticated' THEN PERFORM public.training_fail('AUTHORITY_REQUIRED'); END IF;
 BEGIN uid:=(claims->>'sub')::uuid; EXCEPTION WHEN others THEN PERFORM public.training_fail('AUTHORITY_REQUIRED'); END;
 SELECT owner_user_id INTO owner_id FROM public.training_plan_state WHERE id=1;
 IF uid IS NULL OR uid IS DISTINCT FROM owner_id THEN PERFORM public.training_fail('AUTHORITY_REQUIRED'); END IF;
 RETURN 'owner:'||uid;
END $$;
CREATE FUNCTION public.training_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.training_fail('IMMUTABLE_TRAINING_HISTORY'); RETURN NULL; END $$;
CREATE TRIGGER training_revisions_immutable BEFORE UPDATE OR DELETE ON public.training_plan_revisions FOR EACH ROW EXECUTE FUNCTION public.training_immutable();
CREATE TRIGGER training_sessions_immutable BEFORE UPDATE OR DELETE ON public.training_session_contexts FOR EACH ROW EXECUTE FUNCTION public.training_immutable();
CREATE TRIGGER training_events_immutable BEFORE UPDATE OR DELETE ON public.training_plan_events FOR EACH ROW EXECUTE FUNCTION public.training_immutable();
CREATE FUNCTION public.training_state_validate() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.athlete_timezone) THEN PERFORM public.training_fail('INVALID_TIMEZONE'); END IF;
 IF TG_OP='UPDATE' AND (NEW.owner_user_id<>OLD.owner_user_id OR NEW.athlete_timezone<>OLD.athlete_timezone) THEN PERFORM public.training_fail('OWNER_ZONE_CHANGE_REQUIRES_ADMIN_MIGRATION'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_state_validate BEFORE INSERT OR UPDATE ON public.training_plan_state FOR EACH ROW EXECUTE FUNCTION public.training_state_validate();
CREATE FUNCTION public.training_evidence_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE public.training_plan_state SET evidence_version=evidence_version+1 WHERE id=1;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sets','exercises','workouts','workouts_exercises','daily_logs','cardio_sessions','breathwork_sessions'] LOOP
  EXECUTE format('CREATE TRIGGER training_evidence_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.training_evidence_changed()',t);
 END LOOP;
END $$;
CREATE FUNCTION public.training_event(k text,r uuid,s uuid,p jsonb,a text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE eid uuid; zone text; recorded timestamptz;
BEGIN
 SELECT athlete_timezone INTO zone FROM public.training_plan_state WHERE id=1 FOR UPDATE;
 -- A random UUID must not choose the winner of two confirmations sharing a
 -- clock tick (notably millisecond-resolution WASM). Preserve append order.
 SELECT greatest(clock_timestamp(),max(occurred_at)+interval '1 microsecond') INTO recorded FROM public.training_plan_events;
 INSERT INTO public.training_plan_events(kind,revision_id,session_id,payload,actor,occurred_at,occurred_on,timezone)
 VALUES(k,r,s,coalesce(p,'{}'),coalesce(a,public.training_actor()),recorded,(recorded AT TIME ZONE zone)::date,zone) RETURNING id INTO eid;
 RETURN eid;
END $$;
CREATE FUNCTION public.training_digest(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$ SELECT encode(sha256(convert_to(p::text,'UTF8')),'hex') $$;
CREATE FUNCTION public.training_replay(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e public.training_plan_events; actor_id text; request uuid;
BEGIN
 actor_id:=public.training_actor();
 BEGIN request:=(p->>'request_id')::uuid; EXCEPTION WHEN others THEN PERFORM public.training_fail('INVALID_REQUEST_ID'); END;
 IF request IS NULL THEN PERFORM public.training_fail('INVALID_REQUEST_ID'); END IF;
 SELECT * INTO e FROM public.training_plan_events WHERE actor=actor_id AND request_id=request;
 IF FOUND THEN
  IF e.operation<>op OR e.request_digest<>public.training_digest(p) THEN PERFORM public.training_fail('IDEMPOTENCY_CONFLICT'); END IF;
  RETURN e.result;
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION public.training_lock(p jsonb) RETURNS public.training_plan_state LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public.training_plan_state;
BEGIN
 SELECT * INTO s FROM public.training_plan_state WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.training_fail('UNPROVISIONED'); END IF;
 IF p->>'expected_state_version' IS NULL OR p->>'expected_evidence_version' IS NULL THEN PERFORM public.training_fail('FRESH_CONTEXT_REQUIRED'); END IF;
 IF (p->>'expected_state_version')::bigint<>s.state_version OR (p->>'expected_evidence_version')::bigint<>s.evidence_version THEN PERFORM public.training_fail('VERSION_CONFLICT'); END IF;
 RETURN s;
END $$;
CREATE FUNCTION public.training_receipt(op text,p jsonb,r uuid,sid uuid,extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE eid uuid:=gen_random_uuid(); st public.training_plan_state; result jsonb;
BEGIN
 UPDATE public.training_plan_state SET state_version=state_version+1 WHERE id=1 RETURNING * INTO st;
 result:=jsonb_build_object('status','committed','event_id',eid,'revision_id',r,'session_id',sid,'request_id',p->>'request_id','versions',jsonb_build_object('state',st.state_version,'evidence',st.evidence_version))||extra;
 INSERT INTO public.training_plan_events(id,kind,revision_id,session_id,payload,actor,occurred_on,timezone,request_id,operation,request_digest,result)
 VALUES(eid,'mutation_receipt',r,sid,jsonb_build_object('kind',p->>'kind'),public.training_actor(),(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date,st.athlete_timezone,(p->>'request_id')::uuid,op,public.training_digest(p),result);
 RETURN result;
END $$;
-- Serialize before replay to avoid two concurrent same-request first executions.
CREATE FUNCTION public.training_begin(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb;
BEGIN
 PERFORM public.training_actor();
 PERFORM 1 FROM public.training_plan_state WHERE id=1 FOR UPDATE;
 replay:=public.training_replay(op,p);
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM public.training_lock(p);
 RETURN NULL;
END $$;
-- Preserve classification before old-library edits; an old unlinked resistance
-- set must not disappear from recovery history when an exercise is relabeled.
CREATE FUNCTION public.training_capture_classification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE eid int; category text; metrics jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.training_plan_state WHERE id=1) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='exercises' THEN eid:=OLD.id; category:=OLD.category; metrics:=OLD.metrics;
 ELSE
  eid:=NEW.exercise_id;
  SELECT e.category,e.metrics INTO category,metrics FROM public.exercises e WHERE e.id=eid;
  IF NEW.weight IS NOT NULL THEN category:='strength'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.kind='load_classification' AND e.payload @> jsonb_build_object('exercise_id',eid,'category',category,'metrics',metrics)) THEN
  PERFORM public.training_event('load_classification',NULL,NULL,jsonb_build_object('exercise_id',eid,'category',category,'metrics',metrics,'source_table',TG_TABLE_NAME,'source_operation',TG_OP),'system');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_capture_classification BEFORE UPDATE OF category,metrics ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.training_capture_classification();
CREATE TRIGGER training_capture_set_classification BEFORE INSERT OR UPDATE OF exercise_id,weight ON public.sets FOR EACH ROW EXECUTE FUNCTION public.training_capture_classification();
-- Seal each committed stage, including installations stopped before stage 4.
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'training\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
