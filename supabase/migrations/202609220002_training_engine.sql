-- Additive migration 2/4: validated rules and evidence engine. Apply once.
BEGIN;
CREATE FUNCTION public.training_text(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$ SELECT coalesce(jsonb_typeof(v)='string' AND length(btrim(v#>>'{}'))>0,false) $$;
CREATE FUNCTION public.training_tags(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_typeof(v)='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v)='array' THEN v ELSE '[]' END) x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN ('resistance','full_body','upper','lower','systemic','cardio','mobility','recovery')),false)
$$;
CREATE FUNCTION public.training_exercises(v jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE x jsonb;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN PERFORM public.training_fail('INVALID_EXERCISES'); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR NOT public.training_text(x->'details') OR NOT EXISTS(SELECT 1 FROM public.exercises WHERE id=(x->>'exercise_id')::integer AND NOT is_deleted) THEN PERFORM public.training_fail('INVALID_EXERCISE_REFERENCE'); END IF;
  IF x?'optional' AND jsonb_typeof(x->'optional')<>'boolean' THEN PERFORM public.training_fail('INVALID_EXERCISES'); END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.training_validate_revision(c jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE sl jsonb; q jsonb; a jsonb; x jsonb; k text; ids text[]:='{}'; profile jsonb; dt date; anchor_ids jsonb;
BEGIN
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR c->>'schema_version' IS DISTINCT FROM '1' THEN PERFORM public.training_fail('UNSUPPORTED_SCHEMA'); END IF;
 FOREACH k IN ARRAY ARRAY['macro','block','variation_policy','progression_policy','review_policy','delegation'] LOOP
  IF jsonb_typeof(c->k) IS DISTINCT FROM 'object' THEN PERFORM public.training_fail('INVALID_REVISION:'||k); END IF;
 END LOOP;
 IF NOT public.training_text(c#>'{macro,intent}') OR NOT public.training_text(c#>'{macro,horizon}') OR NOT public.training_text(c#>'{macro,cardio_recovery_intent}') OR jsonb_typeof(c#>'{macro,constraints}') IS DISTINCT FROM 'array' OR jsonb_typeof(c#>'{macro,priorities}') IS DISTINCT FROM 'array' OR jsonb_array_length(c#>'{macro,priorities}')=0 THEN PERFORM public.training_fail('INVALID_MACRO'); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(c#>'{macro,priorities}') LOOP
  IF NOT public.training_text(x->'capacity') OR NOT public.training_text(x->'success_criteria') OR coalesce(x->>'mode','') NOT IN ('build','maintain','deprioritize') THEN PERFORM public.training_fail('INVALID_PRIORITY'); END IF;
 END LOOP;
 IF NOT public.training_text(c#>'{block,key}') OR NOT public.training_text(c#>'{block,purpose}') THEN PERFORM public.training_fail('INVALID_BLOCK'); END IF;
 dt:=public.training_date(c#>>'{block,starts_on}');
 IF public.training_date(c#>>'{block,expected_until}')<dt THEN PERFORM public.training_fail('INVALID_BLOCK_WINDOW'); END IF;
 IF c#>>'{block,authorized_through}' IS NOT NULL AND public.training_date(c#>>'{block,authorized_through}')<dt THEN PERFORM public.training_fail('INVALID_AUTHORIZATION_WINDOW'); END IF;
 profile:=c#>'{block,phase_profile}';
 IF NOT public.training_text(profile->'split') OR jsonb_typeof(profile->'emphases') IS DISTINCT FROM 'array' OR jsonb_array_length(profile->'emphases')=0 OR coalesce(profile->>'rep_emphasis','') NOT IN ('low','mid','high','mixed','not_applicable') OR coalesce(profile->>'laterality_emphasis','') NOT IN ('bilateral','unilateral','mixed','not_applicable') THEN PERFORM public.training_fail('INVALID_PHASE_PROFILE'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(profile->'emphases') e WHERE jsonb_typeof(e)<>'string' OR e#>>'{}' NOT IN ('strength','power','performance','muscle_development','endurance','mobility')) THEN PERFORM public.training_fail('INVALID_PHASE_PROFILE'); END IF;
 IF jsonb_typeof(c->'sequence') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'sequence')=0 THEN PERFORM public.training_fail('INVALID_SEQUENCE'); END IF;
 FOR sl IN SELECT value FROM jsonb_array_elements(c->'sequence') LOOP
  k:=sl->>'key';
  IF NOT public.training_text(sl->'key') OR k=ANY(ids) OR coalesce(sl->>'activity_kind','') NOT IN ('strength','cardio','mobility') OR NOT public.training_text(sl->'purpose') OR coalesce(sl->>'review_scope','') NOT IN ('block',k) OR NOT public.training_tags(sl->'load_tags') THEN PERFORM public.training_fail('INVALID_SLOT'); END IF;
  ids:=array_append(ids,k);
  IF sl->>'activity_kind'='strength' AND NOT (sl->'load_tags' ? 'resistance') THEN PERFORM public.training_fail('INVALID_LOAD_TAGS'); END IF;
  PERFORM public.training_exercises(sl->'exercises');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(sl->'exercises') se JOIN public.exercises e ON e.id=(se->>'exercise_id')::int WHERE e.category='strength' OR coalesce((e.metrics->>'weight')::boolean,false)) AND NOT(sl->'load_tags'?'resistance') THEN PERFORM public.training_fail('INVALID_LOAD_CLASSIFICATION'); END IF;
  q:=sl->'qualification';
  IF q?'required_quality' AND NOT public.training_text(q->'required_quality') THEN PERFORM public.training_fail('INVALID_QUALITY_CRITERION'); END IF;
  IF coalesce(q->>'kind','') NOT IN ('strength_sets','cardio_minutes','reported_objective') OR jsonb_typeof(q->'anchors') IS DISTINCT FROM 'array' OR jsonb_typeof(q->'require_work_set_confirmation') IS DISTINCT FROM 'boolean' OR q->>'queue_effect' IS DISTINCT FROM 'advance' OR coalesce(q->>'out_of_order','') NOT IN ('hold','advance') OR coalesce(q->>'continuation_days','')!~'^\d+$' OR jsonb_typeof(q->'admissible_sources') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'admissible_sources')=0 THEN PERFORM public.training_fail('INVALID_QUALIFICATION'); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'admissible_sources') src WHERE src NOT IN ('logged','self_reported')) THEN PERFORM public.training_fail('INVALID_EVIDENCE_SOURCE'); END IF;
  IF q->>'kind'='strength_sets' THEN
   IF sl->>'activity_kind'<>'strength' OR jsonb_array_length(q->'anchors')=0 THEN PERFORM public.training_fail('INVALID_STRENGTH_RULE'); END IF;
   -- The author, not the engine, defines work. A bare association is never work.
   IF q?'work_set_rule' THEN
    IF jsonb_typeof(q->'work_set_rule') IS DISTINCT FROM 'object' THEN PERFORM public.training_fail('UNSUPPORTED_WORK_SET_PREDICATE'); END IF;
    IF coalesce(q#>>'{work_set_rule,metric}','') NOT IN ('weight','reps','time','distance') OR jsonb_typeof(q#>'{work_set_rule,minimum}') IS DISTINCT FROM 'number' OR EXISTS(SELECT 1 FROM jsonb_object_keys(q->'work_set_rule') key WHERE key NOT IN ('metric','minimum')) THEN PERFORM public.training_fail('UNSUPPORTED_WORK_SET_PREDICATE'); END IF;
    IF (q#>>'{work_set_rule,minimum}')::numeric<=0 THEN PERFORM public.training_fail('UNSUPPORTED_WORK_SET_PREDICATE'); END IF;
   ELSIF q->'require_work_set_confirmation' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.training_fail('UNSUPPORTED_WORK_SET_PREDICATE'); END IF;
   anchor_ids:='[]';
   FOR a IN SELECT value FROM jsonb_array_elements(q->'anchors') LOOP
    IF jsonb_typeof(a->'exercise_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'exercise_ids')=0 OR jsonb_typeof(a->'min_sets') IS DISTINCT FROM 'number' OR coalesce(a->>'min_sets','')!~'^[1-9]\d*$' THEN PERFORM public.training_fail('INVALID_ANCHOR'); END IF;
    IF a?'min_reps' AND (jsonb_typeof(a->'min_reps') IS DISTINCT FROM 'number' OR coalesce(a->>'min_reps','')!~'^[1-9]\d*$') THEN PERFORM public.training_fail('INVALID_ANCHOR'); END IF;
    IF a?'max_rir' AND (jsonb_typeof(a->'max_rir') IS DISTINCT FROM 'number' OR coalesce(a->>'max_rir','')!~'^\d+$' OR (a->>'max_rir')::int>10) THEN PERFORM public.training_fail('INVALID_ANCHOR'); END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(a->'exercise_ids') LOOP
     IF jsonb_typeof(x) IS DISTINCT FROM 'number' OR x#>>'{}' !~ '^[1-9]\d*$' THEN PERFORM public.training_fail('INVALID_EXERCISE_REFERENCE'); END IF;
     IF NOT EXISTS(SELECT 1 FROM public.exercises WHERE id=(x#>>'{}')::int AND NOT is_deleted) THEN PERFORM public.training_fail('INVALID_EXERCISE_REFERENCE'); END IF;
     IF anchor_ids @> jsonb_build_array(x) THEN PERFORM public.training_fail('OVERLAPPING_ANCHORS'); END IF;
     anchor_ids:=anchor_ids||jsonb_build_array(x);
    END LOOP;
   END LOOP;
  ELSIF q->>'kind'='cardio_minutes' THEN
   IF sl->>'activity_kind'<>'cardio' OR coalesce(q->>'min_minutes','')!~'^[1-9]\d*$' THEN PERFORM public.training_fail('INVALID_CARDIO_RULE'); END IF;
  ELSIF NOT public.training_text(q->'objective') OR NOT(q->'admissible_sources'?'self_reported') THEN PERFORM public.training_fail('INVALID_OBJECTIVE');
  END IF;
  IF (profile->'emphases'?'power' OR profile->'emphases'?'performance') AND NOT public.training_text(q->'required_quality') THEN PERFORM public.training_fail('QUALITY_CRITERION_REQUIRED'); END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['comparable','allowed','benefit','review_triggers','transition_rationale'] LOOP
  IF NOT public.training_text(c#>ARRAY['variation_policy',k]) THEN PERFORM public.training_fail('INVALID_VARIATION_POLICY'); END IF;
 END LOOP;
 IF jsonb_typeof(c#>'{variation_policy,previous_phase_ids}') IS DISTINCT FROM 'array' THEN PERFORM public.training_fail('INVALID_PHASE_REFERENCES'); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(c#>'{variation_policy,previous_phase_ids}') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.training_plan_revisions WHERE id=(x#>>'{}')::uuid) THEN PERFORM public.training_fail('INVALID_PHASE_REFERENCES'); END IF;
 END LOOP;
 IF jsonb_typeof(c->'recovery_spacing_rules') IS DISTINCT FROM 'array' THEN PERFORM public.training_fail('INVALID_SPACING_RULES'); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(c->'recovery_spacing_rules') LOOP
  IF NOT public.training_text(x->'id') OR coalesce(x->>'predicate','') NOT IN ('intervening_non_strength_days','min_calendar_days') OR jsonb_typeof(x->'min_days') IS DISTINCT FROM 'number' OR coalesce(x->>'min_days','')!~'^\d+$' OR NOT public.training_tags(x->'candidate_tags') OR NOT public.training_tags(x->'preceding_tags') THEN PERFORM public.training_fail('UNSUPPORTED_SPACING_RULE'); END IF;
  IF jsonb_array_length(x->'candidate_tags')=0 OR jsonb_array_length(x->'preceding_tags')=0 THEN PERFORM public.training_fail('UNSUPPORTED_SPACING_RULE'); END IF;
  IF x->>'predicate'='intervening_non_strength_days' THEN
   IF (x->>'min_days')::int<1 OR x->'require_day_confirmation' IS DISTINCT FROM 'true'::jsonb OR NOT(x->'candidate_tags'?'resistance') OR NOT(x->'preceding_tags'?'resistance') THEN PERFORM public.training_fail('UNSUPPORTED_SPACING_RULE'); END IF;
  ELSIF x?'require_day_confirmation' AND x->'require_day_confirmation' IS DISTINCT FROM 'false'::jsonb THEN PERFORM public.training_fail('UNSUPPORTED_SPACING_RULE'); END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['build','maintain','reduce','recalibrate'] LOOP
  IF NOT public.training_text(c#>ARRAY['progression_policy',k]) THEN PERFORM public.training_fail('INVALID_PROGRESSION_POLICY'); END IF;
 END LOOP;
 PERFORM public.training_date(c#>>'{review_policy,review_due_on}');
 IF coalesce(c#>>'{review_policy,scope}','')<>'block' AND NOT(c#>>'{review_policy,scope}'=ANY(ids)) THEN PERFORM public.training_fail('INVALID_REVIEW_SCOPE'); END IF;
 IF c#>>'{review_policy,exposure_threshold}' IS NOT NULL AND c#>>'{review_policy,exposure_threshold}'!~'^[1-9]\d*$' THEN PERFORM public.training_fail('INVALID_EXPOSURE_THRESHOLD'); END IF;
 IF jsonb_typeof(c#>'{review_policy,concern_triggers}') IS DISTINCT FROM 'array' OR jsonb_typeof(c#>'{delegation,supportive_activities}') IS DISTINCT FROM 'array' OR jsonb_typeof(c#>'{delegation,supportive_constraints}') IS DISTINCT FROM 'object' OR jsonb_typeof(c#>'{delegation,routine_review}') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c#>'{delegation,substitutions}') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c#>'{delegation,stop_conditions}') IS DISTINCT FROM 'array' OR coalesce(c#>>'{delegation,bounded_continuation_days}','')!~'^\d+$' THEN PERFORM public.training_fail('INVALID_DELEGATION'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(c#>'{delegation,supportive_activities}') AS allowed(activity) WHERE allowed.activity NOT IN ('cardio','mobility','rest')) THEN PERFORM public.training_fail('INVALID_DELEGATION'); END IF;
 FOR k IN SELECT jsonb_object_keys(c#>'{delegation,supportive_constraints}') LOOP
  IF k NOT IN ('cardio_max_minutes','cardio_max_intensity','mobility_unloaded') THEN PERFORM public.training_fail('UNSUPPORTED_SUPPORTIVE_CONSTRAINT'); END IF;
 END LOOP;
 FOR k IN SELECT jsonb_array_elements_text(c#>'{delegation,stop_conditions}') LOOP
  IF length(btrim(k))=0 THEN PERFORM public.training_fail('INVALID_STOP_CONDITION'); END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.training_slot(r uuid,k text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT value FROM public.training_plan_revisions r, jsonb_array_elements(r.content->'sequence') s WHERE r.id=$1 AND s.value->>'key'=$2
$$;
CREATE FUNCTION public.training_frozen_exercises(ex jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(x || jsonb_build_object('name',e.name,'metrics',e.metrics,'category',e.category) ORDER BY ord),'[]') FROM jsonb_array_elements(ex) WITH ORDINALITY t(x,ord) JOIN public.exercises e ON e.id=(x->>'exercise_id')::int
$$;
CREATE FUNCTION public.training_workout_content(w integer) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('exercise_id',exercise_id,'details',details,'note',note,'sort_order',sort_order) ORDER BY sort_order,id),'[]') FROM public.workouts_exercises WHERE workout_id=w
$$;
CREATE FUNCTION public.training_evaluate(sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE s public.training_session_contexts; q jsonb; cl jsonb:='{}'; report jsonb; report_id uuid; a jsonb; rowset record; work jsonb; resolution text; resolution_payload jsonb; evidence_fingerprint text; metric_value numeric;
 missing jsonb:='[]'; counts jsonb:='[]'; logged_ok boolean:=true; report_ok boolean:=true; logged_count int:=0; n int; rn int; effort int; local_date date;
 fingerprint jsonb; cardio_fingerprint jsonb:='[]'; source text:='logged'; qualifies text; conflict boolean:=false; has_logs boolean; has_report boolean; valid_dates boolean:=true;
BEGIN
 SELECT * INTO s FROM public.training_session_contexts WHERE id=sid;
 IF NOT FOUND THEN PERFORM public.training_fail('INVALID_SESSION_REFERENCE'); END IF;
 q:=s.snapshot#>'{slot,qualification}';
 SELECT payload INTO cl FROM public.training_plan_events WHERE session_id=sid AND kind='clarify_session' ORDER BY occurred_at DESC,id DESC LIMIT 1;
 cl:=coalesce(cl,'{}');
 SELECT payload->'report',id INTO report,report_id FROM public.training_plan_events WHERE session_id=sid AND kind='confirm_report' ORDER BY occurred_at DESC,id DESC LIMIT 1;
 SELECT payload INTO resolution_payload FROM public.training_plan_events WHERE session_id=sid AND kind='resolve_report' ORDER BY occurred_at DESC,id DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'),count(*) INTO fingerprint,logged_count FROM public.sets t WHERE training_session_id=sid AND NOT is_deleted;
 SELECT coalesce(jsonb_agg(to_jsonb(cs) ORDER BY cs.id),'[]') INTO cardio_fingerprint FROM public.cardio_sessions cs WHERE coalesce(cl->'cardio_session_ids','[]') @> to_jsonb(ARRAY[cs.id]);
 evidence_fingerprint:=public.training_digest(jsonb_build_object('sets',fingerprint,'cardio_sessions',cardio_fingerprint,'clarification',cl,'report',report,'report_event_id',report_id));
 IF resolution_payload->>'evidence_fingerprint'=evidence_fingerprint THEN resolution:=resolution_payload->>'resolution'; END IF;
 has_logs:=logged_count>0; has_report:=report IS NOT NULL;
 IF has_logs AND has_report THEN source:='mixed'; ELSIF has_report THEN source:='self_reported'; END IF;
 IF q IS NULL THEN RETURN jsonb_build_object('qualification','does_not_qualify','missing_qualifiers','[]'::jsonb,'raw_logged_set_count',logged_count,'source',source,'queue_effect','hold','fingerprint',evidence_fingerprint,'evidence_fingerprint',evidence_fingerprint,'reason','supportive_intent','effective_report',CASE WHEN resolution='use_logs' THEN NULL ELSE report END); END IF;
 -- Every cross-date record needs explicit, bounded continuation, even if above minimum.
 FOR rowset IN SELECT t.*, (t.logged_at AT TIME ZONE s.timezone)::date AS local_on FROM public.sets t WHERE t.training_session_id=sid AND NOT t.is_deleted LOOP
  IF rowset.local_on<>s.planned_date AND (NOT(coalesce(cl->'continuation_dates','[]')?rowset.local_on::text) OR rowset.local_on<s.planned_date OR rowset.local_on>s.planned_date+(q->>'continuation_days')::int) THEN valid_dates:=false; END IF;
 END LOOP;
 IF NOT valid_dates THEN missing:=missing||'"explicit_continuation"'::jsonb; logged_ok:=false; END IF;
 IF NOT(q->'admissible_sources'?'logged') THEN logged_ok:=false; END IF;
 IF q->>'kind'='strength_sets' THEN
  IF NOT (cl?'set_ids') AND has_logs AND (q->'require_work_set_confirmation'='true'::jsonb OR NOT(q?'work_set_rule')) THEN missing:=missing||'"work_set_identification"'::jsonb; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(q->'anchors') LOOP
   n:=0;
   FOR rowset IN SELECT t.* FROM public.sets t WHERE t.training_session_id=sid AND NOT t.is_deleted AND (a->'exercise_ids') @> to_jsonb(ARRAY[t.exercise_id]) LOOP
    -- Explicit session identification overrides the automatic intent predicate.
    IF cl?'set_ids' THEN
     IF NOT(cl->'set_ids' @> to_jsonb(ARRAY[rowset.id])) THEN CONTINUE; END IF;
    ELSIF q->'require_work_set_confirmation'='false'::jsonb AND q?'work_set_rule' THEN
     metric_value:=(to_jsonb(rowset)->>(q#>>'{work_set_rule,metric}'))::numeric;
     IF metric_value IS NULL THEN missing:=missing||jsonb_build_array('work_set_metric:'||(q#>>'{work_set_rule,metric}')); CONTINUE; END IF;
     IF metric_value<(q#>>'{work_set_rule,minimum}')::numeric THEN CONTINUE; END IF;
    ELSE CONTINUE;
    END IF;
    effort:=coalesce(rowset.rir,(cl#>>ARRAY['effort_by_set',rowset.id::text])::int);
    IF a?'min_reps' AND rowset.reps IS NULL THEN missing:=missing||'"reps"'::jsonb; CONTINUE; END IF;
    IF a?'max_rir' AND effort IS NULL THEN missing:=missing||'"effort"'::jsonb; CONTINUE; END IF;
    IF (NOT(a?'min_reps') OR rowset.reps>=(a->>'min_reps')::int) AND (NOT(a?'max_rir') OR effort<=(a->>'max_rir')::int) THEN n:=n+1; END IF;
   END LOOP;
   counts:=counts||jsonb_build_object('exercise_ids',a->'exercise_ids','qualifying_work_sets',n);
   IF n<(a->>'min_sets')::int THEN logged_ok:=false; END IF;
   rn:=0;
   FOR work IN SELECT value FROM jsonb_array_elements(coalesce(report->'work','[]')) LOOP
    IF a->'exercise_ids' @> jsonb_build_array((work->>'exercise_id')::int) AND work->>'sets' IS NOT NULL
    AND (NOT(a?'min_reps') OR (work->>'reps')::int>=(a->>'min_reps')::int)
    AND (NOT(a?'max_rir') OR (work->>'rir')::int<=(a->>'max_rir')::int) THEN rn:=rn+(work->>'sets')::int; END IF;
   END LOOP;
   IF rn<(a->>'min_sets')::int THEN report_ok:=false; END IF;
   IF has_report AND has_logs AND (cl?'set_ids' OR (q->'require_work_set_confirmation'='false'::jsonb AND q?'work_set_rule')) AND n<>rn THEN conflict:=true; END IF;
  END LOOP;
 ELSIF q->>'kind'='cardio_minutes' THEN
  SELECT coalesce(sum(duration_minutes),0) INTO n FROM public.cardio_sessions cs WHERE NOT cs.is_deleted AND coalesce(cl->'cardio_session_ids','[]') @> to_jsonb(ARRAY[cs.id]) AND (cs.date=s.planned_date OR (coalesce(cl->'continuation_dates','[]')?cs.date::text AND cs.date BETWEEN s.planned_date AND s.planned_date+(q->>'continuation_days')::int));
  -- An actual candidate is not an association. Ask the owner to identify it.
  IF n=0 AND q->'admissible_sources'?'logged' AND EXISTS(
   SELECT 1 FROM public.cardio_sessions cs WHERE NOT cs.is_deleted
    AND (cs.date=s.planned_date OR coalesce(cl->'continuation_dates','[]')?cs.date::text)
  ) THEN missing:=missing||'"cardio_association"'::jsonb; END IF;
  logged_ok:=logged_ok AND n>=(q->>'min_minutes')::int;
  report_ok:=coalesce((report->>'minutes')::int>=(q->>'min_minutes')::int,false);
  has_logs:=n>0;
  source:=CASE WHEN has_logs AND has_report THEN 'mixed' WHEN has_report THEN 'self_reported' ELSE 'logged' END;
  IF has_logs AND has_report THEN source:='mixed'; conflict:=n<>(report->>'minutes')::int; END IF;
 ELSE
  logged_ok:=false; report_ok:=coalesce((report->>'objective_met')::boolean,false);
  -- A mobility objective is not evidence of unloaded work by its label alone.
  -- Require an athlete-confirmed classification matching the authored intent.
  IF has_report AND (NOT public.training_tags(report->'load_tags') OR NOT(coalesce(report->'load_tags','[]') @> s.load_tags)) THEN
   report_ok:=false; missing:=missing||'"reported_load_tags"'::jsonb;
  END IF;
 END IF;
 IF q?'required_quality' THEN
  IF cl->>'quality' IS DISTINCT FROM q->>'required_quality' THEN logged_ok:=false; IF has_logs THEN missing:=missing||'"required_quality_evidence"'::jsonb; END IF; END IF;
  IF report->>'quality' IS DISTINCT FROM q->>'required_quality' THEN report_ok:=false; END IF;
 END IF;
 report_ok:=coalesce(report_ok AND has_report AND q->'admissible_sources'?'self_reported',false);
 IF NOT has_logs AND q->>'kind'<>'cardio_minutes' THEN logged_ok:=false; END IF;
 IF resolution='use_logs' THEN report_ok:=false; has_report:=false; conflict:=false; source:='logged'; END IF;
 IF resolution='use_report' THEN logged_ok:=false; conflict:=false; source:='self_reported'; missing:='[]'; END IF;
 IF conflict THEN missing:=missing||'"report_log_discrepancy"'::jsonb; qualifies:='pending';
 ELSIF logged_ok OR report_ok THEN qualifies:='qualifies'; missing:='[]';
 ELSIF jsonb_array_length(missing)>0 OR (has_report AND NOT report_ok) THEN qualifies:='pending'; IF has_report AND NOT report_ok THEN missing:=missing||'"report_rule_details"'::jsonb; END IF;
 ELSE qualifies:='does_not_qualify'; END IF;
 RETURN jsonb_build_object('qualification',qualifies,'missing_qualifiers',missing,'source',source,'raw_logged_set_count',logged_count,'reported_work',report,'effective_report',CASE WHEN resolution='use_logs' THEN NULL ELSE report END,'anchor_counts',counts,'queue_effect',CASE WHEN qualifies='qualifies' THEN q->>'queue_effect' ELSE 'hold' END,'evidence_fingerprint',evidence_fingerprint,'fingerprint',public.training_digest(jsonb_build_object('evidence',evidence_fingerprint,'resolution',resolution)));
END $$;
CREATE FUNCTION public.training_queue() RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE st public.training_plan_state; c jsonb; baseline public.training_plan_events; act public.training_plan_events; s record; ev jsonb; nextkey text; reskey text; pos int; total int; cnt int:=0; uncertain boolean:=false; basis jsonb:='[]'; prior jsonb; sequence jsonb;
BEGIN
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 SELECT content INTO c FROM public.training_plan_revisions WHERE id=st.active_revision_id;
 IF c IS NULL THEN RETURN jsonb_build_object('next_slot_key',NULL,'next_resistance_slot',NULL,'confidence','resolved','basis_event_ids','[]'::jsonb,'qualifying_exposures',0); END IF;
 sequence:=c->'sequence'; total:=jsonb_array_length(sequence);
 SELECT * INTO act FROM public.training_plan_events WHERE revision_id=st.active_revision_id AND kind='activation' ORDER BY occurred_at DESC,id DESC LIMIT 1;
 SELECT * INTO baseline FROM public.training_plan_events WHERE revision_id=st.active_revision_id AND kind='queue_correction' AND occurred_at>act.occurred_at ORDER BY occurred_at DESC,id DESC LIMIT 1;
 IF baseline.id IS NULL THEN baseline:=act; nextkey:=act.payload->>'seed_slot_key'; ELSE nextkey:=baseline.payload->>'next_slot_key'; END IF;
 basis:=jsonb_build_array(baseline.id);
 FOR s IN SELECT sc.*, (SELECT min(e.occurred_at) FROM public.training_plan_events e WHERE e.session_id=sc.id AND e.kind='reconcile' AND e.payload->>'qualification'='qualifies') AS first_credit FROM public.training_session_contexts sc WHERE sc.revision_id=st.active_revision_id AND sc.slot_key IS NOT NULL ORDER BY sc.planned_date,sc.created_at,sc.id LOOP
  ev:=public.training_evaluate(s.id);
  IF ev->>'qualification'='qualifies' THEN cnt:=cnt+1; END IF;
  SELECT payload INTO prior FROM public.training_plan_events WHERE session_id=s.id AND kind='reconcile' ORDER BY occurred_at DESC,id DESC LIMIT 1;
  IF baseline.kind='activation' OR s.first_credit>baseline.occurred_at THEN
   IF (s.first_credit IS NOT NULL AND ev->>'qualification'<>'qualifies') OR coalesce((prior->>'queue_uncertain')::boolean,false) THEN uncertain:=true; END IF;
   IF ev->>'qualification'='qualifies' AND s.first_credit IS NOT NULL THEN
    IF s.slot_key=nextkey OR s.snapshot#>>'{slot,qualification,out_of_order}'='advance' THEN
     SELECT ord::int INTO pos FROM jsonb_array_elements(sequence) WITH ORDINALITY x(v,ord) WHERE v->>'key'=s.slot_key;
     nextkey:=sequence->(pos%total)->>'key';
    END IF;
    basis:=basis||jsonb_build_array(s.id);
   END IF;
  END IF;
 END LOOP;
 SELECT ord::int INTO pos FROM jsonb_array_elements(sequence) WITH ORDINALITY x(v,ord) WHERE v->>'key'=nextkey;
 FOR i IN 0..total-1 LOOP
  IF sequence->((pos-1+i)%total)->>'activity_kind'='strength' THEN reskey:=sequence->((pos-1+i)%total)->>'key'; EXIT; END IF;
 END LOOP;
 RETURN jsonb_build_object('next_slot_key',nextkey,'next_resistance_slot',reskey,'confidence',CASE WHEN uncertain THEN 'unresolved' ELSE 'resolved' END,'basis_event_ids',basis,'qualifying_exposures',cnt);
END $$;
CREATE FUNCTION public.training_open_concerns() RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at,e.id),'[]') FROM public.training_plan_events e WHERE e.kind='concern' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events r WHERE r.kind='review' AND r.payload->'resolve_concern_ids' ? e.id::text)
$$;
CREATE FUNCTION public.training_sync_review() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE st public.training_plan_state; c jsonb; latest public.training_plan_events; act public.training_plan_events; due date; threshold int; n int; scope text; key text; reason text; concern jsonb; eid uuid;
BEGIN
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 IF st.active_revision_id IS NULL THEN RETURN; END IF;
 -- Turn a reached deviation revisit into one durable concern, even when no
 -- further workout mutation occurs on that day.
 FOR concern IN SELECT to_jsonb(e) FROM public.training_plan_events e WHERE e.kind='deviation' AND (e.payload->>'revisit_on')::date<=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date AND NOT EXISTS(SELECT 1 FROM public.training_plan_events h WHERE h.kind='concern' AND h.payload->>'deviation_event_id'=e.id::text) LOOP
  PERFORM public.training_event('concern',(concern->>'revision_id')::uuid,(concern->>'session_id')::uuid,jsonb_build_object('code','deviation_revisit','reason','Recorded deviation reached its revisit date','stop',false,'activity_kinds','[]'::jsonb,'deviation_event_id',concern->>'id','revisit_on',concern#>'{payload,revisit_on}'),'system');
 END LOOP;
 SELECT content INTO c FROM public.training_plan_revisions WHERE id=st.active_revision_id;
 SELECT * INTO act FROM public.training_plan_events WHERE kind='activation' AND revision_id=st.active_revision_id ORDER BY occurred_at DESC,id DESC LIMIT 1;
 SELECT * INTO latest FROM public.training_plan_events WHERE kind='review' AND revision_id=st.active_revision_id ORDER BY occurred_at DESC,id DESC LIMIT 1;
 due:=coalesce((latest.payload->>'next_review_on')::date,(c#>>'{review_policy,review_due_on}')::date);
 threshold:=coalesce((latest.payload->>'next_exposure_threshold')::int,(c#>>'{review_policy,exposure_threshold}')::int);
 scope:=c#>>'{review_policy,scope}';
 SELECT count(*) INTO n FROM public.training_session_contexts s WHERE s.revision_id=st.active_revision_id AND (scope='block' OR s.slot_key=scope) AND public.training_evaluate(s.id)->>'qualification'='qualifies' AND EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.session_id=s.id AND e.kind='reconcile' AND e.payload->>'qualification'='qualifies' AND e.occurred_at>coalesce(latest.occurred_at,act.occurred_at)) AND NOT EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.session_id=s.id AND e.kind='reconcile' AND e.payload->>'qualification'='qualifies' AND e.occurred_at<=coalesce(latest.occurred_at,act.occurred_at));
 FOR reason IN SELECT unnest(ARRAY['calendar','exposure']) LOOP
  IF (reason='calendar' AND (clock_timestamp() AT TIME ZONE st.athlete_timezone)::date>=due) OR (reason='exposure' AND threshold IS NOT NULL AND n>=threshold) THEN
   key:=coalesce(latest.id,act.id)::text||':'||reason;
   IF NOT EXISTS(SELECT 1 FROM public.training_plan_events WHERE kind='review_due' AND payload->>'trigger_key'=key) THEN
    eid:=public.training_event('review_due',st.active_revision_id,NULL,jsonb_build_object('trigger_key',key,'reason',reason,'original_due_on',CASE WHEN reason='calendar' THEN due ELSE (clock_timestamp() AT TIME ZONE st.athlete_timezone)::date END,'exposures',n,'baseline_event_id',coalesce(latest.id,act.id)),'system');
    UPDATE public.training_plan_state SET state_version=state_version+1 WHERE id=1;
   END IF;
  END IF;
 END LOOP;
 FOR concern IN SELECT value FROM jsonb_array_elements(public.training_open_concerns()) LOOP
  key:='concern:'||(concern->>'id');
  IF NOT EXISTS(SELECT 1 FROM public.training_plan_events WHERE kind='review_due' AND payload->>'trigger_key'=key) THEN
   PERFORM public.training_event('review_due',st.active_revision_id,NULL,jsonb_build_object('trigger_key',key,'reason','concern','concern_id',concern->>'id','original_due_on',concern->>'occurred_on'),'system');
   UPDATE public.training_plan_state SET state_version=state_version+1 WHERE id=1;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.training_review() RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE rid uuid; reasons jsonb; last_review jsonb; handling jsonb; first_due text;
BEGIN
 SELECT active_revision_id INTO rid FROM public.training_plan_state WHERE id=1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('event_id',e.id)||e.payload ORDER BY e.occurred_at,e.id),'[]'),min(e.payload->>'original_due_on') INTO reasons,first_due FROM public.training_plan_events e WHERE e.kind='review_due' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events r WHERE r.kind='review' AND r.payload->'review_event_ids'?e.id::text);
 SELECT to_jsonb(e) INTO last_review FROM public.training_plan_events e WHERE kind='review' ORDER BY occurred_at DESC,id DESC LIMIT 1;
 SELECT jsonb_build_object('event_id',id,'kind',kind)||payload INTO handling FROM public.training_plan_events WHERE kind='bounded_continuation' AND revision_id=rid ORDER BY occurred_at DESC,id DESC LIMIT 1;
 RETURN jsonb_build_object('review_due',jsonb_array_length(reasons)>0,'reasons',reasons,'original_due_on',first_due,'last_review',last_review,'handling',handling,'open_concerns',public.training_open_concerns());
END $$;
-- Resolve load by exact exercise ID, never by name, proposal, or current phase
-- alone. Validated slot membership and anchor/equivalent IDs in ACTIVATED
-- revisions supply conservative classifications; later phases can add load but
-- cannot erase an earlier accepted classification. This does not link/credit work.
CREATE FUNCTION public.training_exercise_load_tags(eid integer) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH metadata AS (
  SELECT e.category,e.metrics FROM public.exercises e WHERE e.id=eid
  UNION ALL
  SELECT h.payload->>'category',h.payload->'metrics' FROM public.training_plan_events h WHERE h.kind='load_classification' AND h.payload->>'exercise_id'=eid::text
  UNION ALL
  SELECT x->>'category',x->'metrics' FROM public.training_session_contexts s, jsonb_array_elements(coalesce(s.snapshot->'exercises','[]')) x WHERE (x->>'exercise_id')::int=eid
 ), approved AS (
  SELECT sl FROM public.training_plan_revisions r, jsonb_array_elements(r.content->'sequence') sl
  WHERE EXISTS(SELECT 1 FROM public.training_plan_events a WHERE a.kind='activation' AND a.revision_id=r.id)
   AND (EXISTS(SELECT 1 FROM jsonb_array_elements(sl->'exercises') x WHERE (x->>'exercise_id')::int=eid)
    OR (sl#>>'{qualification,kind}'='strength_sets' AND EXISTS(SELECT 1 FROM jsonb_array_elements(sl#>'{qualification,anchors}') a WHERE a->'exercise_ids' @> jsonb_build_array(eid))))
 ), classified AS (
  SELECT tag FROM approved, jsonb_array_elements(sl->'load_tags') tag
  UNION ALL
  SELECT to_jsonb(tag) FROM metadata, unnest(CASE WHEN category='strength' OR metrics->'weight'='true'::jsonb THEN ARRAY['resistance','systemic'] ELSE ARRAY[]::text[] END) tag
  UNION ALL
  SELECT to_jsonb(tag) FROM metadata, unnest(CASE WHEN category='cardio' THEN ARRAY['cardio','systemic'] ELSE ARRAY[]::text[] END) tag
 ) SELECT coalesce(jsonb_agg(DISTINCT tag),'[]') FROM classified
$$;
-- Missing regional evidence is separate from affirmative tags. A full-body slot
-- alone does not establish which region each of its individual exercises loads.
-- Known upper/lower classifications are unioned across accepted history above.
CREATE FUNCTION public.training_unknown_regions(tags jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN tags?'resistance' AND NOT(tags ?| ARRAY['upper','lower'])
  THEN CASE WHEN tags?'full_body' THEN '["upper","lower"]'::jsonb ELSE '["upper","lower","full_body"]'::jsonb END
  ELSE '[]'::jsonb END
$$;
CREATE FUNCTION public.training_content_load(ex jsonb) RETURNS TABLE(tags jsonb,unresolved_tags jsonb) LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH per_exercise AS MATERIALIZED (
  SELECT public.training_exercise_load_tags((x->>'exercise_id')::int) AS tags FROM jsonb_array_elements(ex) x
 ) SELECT
  (SELECT coalesce(jsonb_agg(DISTINCT t),'[]') FROM per_exercise p, jsonb_array_elements(p.tags) t),
  (SELECT coalesce(jsonb_agg(DISTINCT t),'[]') FROM per_exercise p, jsonb_array_elements(public.training_unknown_regions(p.tags)) t)
$$;
CREATE FUNCTION public.training_load_dates(zone text) RETURNS TABLE(load_date date,tags jsonb,source text,source_id text,unresolved_tags jsonb) LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 -- Actual nonqualifying/unlinked work retains accepted exercise classifications.
 SELECT (s.logged_at AT TIME ZONE zone)::date, coalesce(sc.load_tags,'[]') || cl.tags,
  'set',s.id::text,public.training_unknown_regions(cl.tags)
 FROM public.sets s LEFT JOIN public.training_session_contexts sc ON sc.id=s.training_session_id
 CROSS JOIN LATERAL (SELECT public.training_exercise_load_tags(s.exercise_id) || CASE WHEN s.weight IS NOT NULL THEN '["resistance","systemic"]'::jsonb ELSE '[]'::jsonb END AS tags) cl
 WHERE NOT s.is_deleted
 UNION ALL
 -- Qualification and spacing share the latest report and evidence-scoped
 -- resolution. Historical reports remain immutable, not permanently actual.
 -- Never filter by qualification: a below-minimum report still imposes load.
 SELECT (r.report->>'performed_on')::date, load.tags || CASE WHEN load.tags?'resistance' THEN '["systemic"]'::jsonb ELSE '[]'::jsonb END,'report',e.id::text,
  cl.unresolved_tags || public.training_unknown_regions(load.tags)
 FROM public.training_session_contexts sc
 CROSS JOIN LATERAL (SELECT public.training_evaluate(sc.id)->'effective_report' AS report) r
 CROSS JOIN LATERAL (SELECT id FROM public.training_plan_events WHERE session_id=sc.id AND kind='confirm_report' ORDER BY occurred_at DESC,id DESC LIMIT 1) e
 CROSS JOIN LATERAL (SELECT coalesce(jsonb_agg(w),'[]') AS work FROM jsonb_array_elements(coalesce(r.report->'work','[]')) w WHERE (w->>'sets')::int>0) actual
 CROSS JOIN LATERAL public.training_content_load(actual.work) cl
 CROSS JOIN LATERAL (SELECT coalesce(r.report->'load_tags',sc.load_tags) || cl.tags ||
  CASE WHEN jsonb_array_length(actual.work)>0 THEN '["resistance","systemic"]'::jsonb ELSE '[]'::jsonb END ||
  CASE WHEN coalesce((r.report->>'minutes')::int,0)>0 THEN '["cardio","systemic"]'::jsonb ELSE '[]'::jsonb END AS tags) load
 WHERE jsonb_array_length(actual.work)>0 OR coalesce((r.report->>'minutes')::int,0)>0 OR r.report->'objective_met'='true'::jsonb
 UNION ALL
 -- Latest complete day testimony can establish actual unlogged resistance,
 -- never its anatomical region or qualification. Positive sets remain separate.
 SELECT (e.payload->>'date')::date,'["resistance","systemic"]'::jsonb,
  'day_confirmation',e.id::text,'["upper","lower","full_body"]'::jsonb
 FROM (SELECT DISTINCT ON (payload->>'date') * FROM public.training_plan_events
  WHERE kind='confirm_day' ORDER BY payload->>'date',occurred_at DESC,id DESC) e
 WHERE e.payload->'complete'='true'::jsonb AND e.payload->'non_strength'='false'::jsonb
 UNION ALL
 SELECT cs.date,jsonb_build_array('cardio','systemic') || cl.tags,'cardio',cs.id::text,public.training_unknown_regions(cl.tags)
 FROM public.cardio_sessions cs CROSS JOIN LATERAL (SELECT public.training_exercise_load_tags(cs.exercise_id) AS tags) cl WHERE NOT cs.is_deleted
$$;
CREATE FUNCTION public.training_eligibility(d date,kind text,ex jsonb DEFAULT '[]',slot jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE st public.training_plan_state; c jsonb; tags jsonb; unresolved_tags jsonb; candidate_match boolean; candidate_unknown boolean; uncertain_load jsonb; rule jsonb; prev date; earliest date; rule_earliest date; day date; confirmed int; unknown_day boolean; reasons jsonb:='[]'; conditions jsonb:='[]'; concern jsonb; q jsonb; prior_data jsonb:='[]'; rule_data jsonb; is_strength boolean; today date;
BEGIN
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 today:=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date;
 SELECT content INTO c FROM public.training_plan_revisions WHERE id=st.active_revision_id;
 SELECT cl.tags,cl.unresolved_tags INTO tags,unresolved_tags FROM public.training_content_load(ex) cl;
 tags:=tags || coalesce(slot->'load_tags','[]');
 is_strength:=kind='strength' OR tags?'resistance';
 IF is_strength THEN tags:=tags||'["resistance","systemic"]'::jsonb; END IF;
 IF kind='cardio' THEN tags:=tags||'["cardio","systemic"]'::jsonb; END IF;
 -- Legacy unlinked callers supply mobility as a fallback, not a classification.
 -- Do not let it mask (or falsely add to) the activity of nonempty content.
 IF kind IN ('mobility','rest') AND (slot IS NOT NULL OR jsonb_array_length(ex)=0) THEN tags:=tags||jsonb_build_array(kind); END IF;
 IF jsonb_array_length(ex)=0 THEN unresolved_tags:=public.training_unknown_regions(tags); END IF;
 SELECT coalesce(jsonb_agg(DISTINCT t),'[]') INTO tags FROM jsonb_array_elements(tags) t;
 earliest:=d;
 IF c IS NULL OR st.lifecycle<>'active' THEN reasons:=reasons||'"INACTIVE_AUTHORITY"'::jsonb; END IF;
 IF c#>>'{block,authorized_through}' IS NOT NULL AND d>(c#>>'{block,authorized_through}')::date THEN reasons:=reasons||'"AUTHORIZATION_EXPIRED"'::jsonb; END IF;
 IF c IS NOT NULL AND d<(c#>>'{block,starts_on}')::date THEN reasons:=reasons||'"BEFORE_AUTHORIZED_START"'::jsonb; END IF;
 q:=public.training_queue();
 IF (is_strength OR slot IS NOT NULL) AND q->>'confidence'='unresolved' THEN reasons:=reasons||'"QUEUE_UNRESOLVED"'::jsonb; END IF;
 FOR concern IN SELECT value FROM jsonb_array_elements(public.training_open_concerns()) LOOP
  IF coalesce((concern#>>'{payload,stop}')::boolean,false) AND EXISTS(
   SELECT 1 FROM jsonb_array_elements_text(concern#>'{payload,activity_kinds}') a
   WHERE tags ? CASE WHEN a='strength' THEN 'resistance' ELSE a END
  ) THEN reasons:=reasons||'"STOP_CONDITION"'::jsonb; conditions:=conditions||jsonb_build_array(concern->'id'); END IF;
 END LOOP;
 FOR rule IN SELECT value FROM jsonb_array_elements(coalesce(c->'recovery_spacing_rules','[]')) LOOP
  candidate_match:=EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'candidate_tags') t WHERE tags?t);
  candidate_unknown:=NOT candidate_match AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'candidate_tags') t WHERE unresolved_tags?t);
  IF NOT candidate_match AND NOT candidate_unknown THEN CONTINUE; END IF;
  -- Fail closed only when unresolved regions can change this rule's answer.
  -- Old load outside a calendar rule's horizon and independent activity remain
  -- eligible. Unknown tags never become affirmative regional load assertions.
  SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') INTO uncertain_load
  FROM public.training_load_dates(st.athlete_timezone) l
  WHERE l.load_date<=d AND d<l.load_date+(rule->>'min_days')::int+CASE WHEN rule->>'predicate'='intervening_non_strength_days' THEN 1 ELSE 0 END
   AND ((candidate_unknown AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'preceding_tags') t WHERE l.tags?t OR l.unresolved_tags?t))
    OR (candidate_match AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'preceding_tags') t WHERE l.tags?t)
     AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'preceding_tags') t WHERE l.unresolved_tags?t)));
  IF jsonb_array_length(uncertain_load)>0 THEN
   reasons:=reasons||'"LOAD_CLASSIFICATION_REQUIRED"'::jsonb;
   conditions:=conditions||jsonb_build_object('rule_id',rule->>'id','candidate_unresolved_tags',unresolved_tags,'candidate_exercise_ids',(SELECT coalesce(jsonb_agg(x->'exercise_id'),'[]') FROM jsonb_array_elements(ex) x),'unresolved_actual_load',uncertain_load);
   prior_data:=prior_data||uncertain_load;
  END IF;
  IF NOT candidate_match THEN CONTINUE; END IF;
  SELECT max(l.load_date),coalesce(jsonb_agg(to_jsonb(l)),'[]') INTO prev,rule_data FROM public.training_load_dates(st.athlete_timezone) l WHERE l.load_date<=d AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'preceding_tags') t WHERE l.tags?t);
  prior_data:=prior_data||rule_data;
  IF prev IS NULL THEN CONTINUE; END IF;
  rule_earliest:=prev+(rule->>'min_days')::int+CASE WHEN rule->>'predicate'='intervening_non_strength_days' THEN 1 ELSE 0 END;
  earliest:=greatest(earliest,rule_earliest);
  IF d<rule_earliest THEN reasons:=reasons||'"RECOVERY_SPACING_NOT_MET"'::jsonb; conditions:=conditions||jsonb_build_object('rule_id',rule->>'id','preceding_on',prev,'earliest_calendar_candidate',rule_earliest); CONTINUE; END IF;
  IF rule->>'predicate'='min_calendar_days' THEN CONTINUE; END IF;
  confirmed:=0; unknown_day:=false;
  FOR day IN SELECT generate_series((prev+1)::timestamp,(d-1)::timestamp,interval '1 day')::date LOOP
   IF EXISTS(SELECT 1 FROM public.training_load_dates(st.athlete_timezone) l WHERE l.load_date=day AND l.tags?'resistance') THEN CONTINUE; END IF;
   IF day<today AND EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.kind='confirm_day' AND e.payload->>'date'=day::text AND e.payload->>'non_strength'='true' AND e.payload->>'complete'='true' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events later WHERE later.kind='confirm_day' AND later.payload->>'date'=day::text AND (later.occurred_at,later.id)>(e.occurred_at,e.id))) THEN confirmed:=confirmed+1;
   ELSE unknown_day:=true; conditions:=conditions||jsonb_build_object('confirm_non_strength_date',day,'must_be_complete',true); END IF;
  END LOOP;
  IF confirmed<(rule->>'min_days')::int THEN reasons:=reasons||'"INCOMPLETE_INTERVENING_DAY_EVIDENCE"'::jsonb; earliest:=NULL; END IF;
 END LOOP;
 -- PostgreSQL greatest(NULL, date) returns date: a later rule must not erase
 -- indeterminacy established by an earlier rule's missing day evidence.
 IF reasons?'INCOMPLETE_INTERVENING_DAY_EVIDENCE' OR reasons?'LOAD_CLASSIFICATION_REQUIRED' THEN earliest:=NULL; END IF;
 conditions:=conditions||'"Spacing is not recovery certification; assess current symptoms and readiness"'::jsonb;
 RETURN jsonb_build_object('eligible',jsonb_array_length(reasons)=0,'eligible_on_or_after',earliest,'reasons',reasons,'conditions',conditions,'actual_load',prior_data,'evaluated_load_tags',tags,'unresolved_load_tags',unresolved_tags);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'training\_%' ESCAPE '\' OR p.proname IN ('get_training_context','get_training_history','get_training_request','propose_training_revision','activate_training_revision','set_training_lifecycle','record_training_decision','materialize_training_session','mutate_training_workout')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
