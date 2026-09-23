-- Additive migration 3/4: transactional public RPCs. No live data is provisioned.
BEGIN;
CREATE FUNCTION public.training_keys(p jsonb, allowed text[]) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) THEN PERFORM public.training_fail('INVALID_INPUT_FIELDS'); END IF;
END $$;
CREATE FUNCTION public.training_reason(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT public.training_text(p->'reason') THEN PERFORM public.training_fail('REASON_REQUIRED'); END IF;
END $$;
CREATE FUNCTION public.training_reconcile(sid uuid,outcome text DEFAULT 'unknown') RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public.training_session_contexts; ev jsonb; prior jsonb; uncertain boolean; eid uuid;
BEGIN
 IF outcome NOT IN ('finished','reduced','partial','stopped','unknown') THEN PERFORM public.training_fail('INVALID_OUTCOME'); END IF;
 SELECT * INTO s FROM public.training_session_contexts WHERE id=sid;
 ev:=public.training_evaluate(sid);
 SELECT payload INTO prior FROM public.training_plan_events WHERE session_id=sid AND kind='reconcile' ORDER BY occurred_at DESC,id DESC LIMIT 1;
 uncertain:=coalesce((prior->>'queue_uncertain')::boolean,false) OR (ev->>'qualification'<>'qualifies' AND EXISTS(SELECT 1 FROM public.training_plan_events WHERE session_id=sid AND kind='reconcile' AND payload->>'qualification'='qualifies'));
 ev:=ev||jsonb_build_object('outcome',outcome,'rule_revision_id',s.revision_id,'queue_uncertain',uncertain);
 eid:=public.training_event('reconcile',s.revision_id,sid,ev);
 PERFORM public.training_sync_review();
 RETURN ev||jsonb_build_object('decision_event_id',eid,'set_rows_created',0);
END $$;
CREATE FUNCTION public.training_check_review(d date) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; h jsonb; st public.training_plan_state; today date;
BEGIN
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 today:=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date;
 r:=public.training_review(); h:=r->'handling';
 IF coalesce((r->>'review_due')::boolean,false) AND (h IS NULL OR h='null'::jsonb OR (h->>'revisit_on')::date<=today OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'reasons') x WHERE NOT(coalesce(h->'review_event_ids','[]')? (x->>'event_id')))) THEN PERFORM public.training_fail('REVIEW_HANDLING_REQUIRED'); END IF;
END $$;
CREATE FUNCTION public.training_check_prescription(d date,kind text,ex jsonb,sl jsonb,linked boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e jsonb; reasons jsonb; st public.training_plan_state;
BEGIN
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 e:=public.training_eligibility(d,kind,ex,sl); reasons:=e->'reasons';
 -- Explicit independent work does not inherit linked lifecycle/queue authority,
 -- but still cannot bypass actual-load spacing or applicable stop conditions.
 IF NOT linked THEN reasons:=reasons-'INACTIVE_AUTHORITY'-'AUTHORIZATION_EXPIRED'-'BEFORE_AUTHORIZED_START'-'QUEUE_UNRESOLVED'; END IF;
 IF jsonb_array_length(reasons)>0 THEN PERFORM public.training_fail(reasons->>0); END IF;
 IF linked THEN PERFORM public.training_check_review(d); END IF;
 RETURN e;
END $$;
CREATE FUNCTION public.get_training_context(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE st public.training_plan_state; c jsonb; d date; today date; queue jsonb; activities jsonb:='{}'; k text; sl jsonb; ev jsonb; rec jsonb; sessions jsonb; revisions jsonb; rawsets jsonb; reviews jsonb; blockers jsonb:='[]'; can jsonb:='{}'; w jsonb; act uuid; occurrence record; evaluated jsonb; previous jsonb;
BEGIN
 PERFORM public.training_keys(p_input,ARRAY['target_date','session_id']);
 PERFORM public.training_actor();
 SELECT * INTO st FROM public.training_plan_state WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN
  today:=(clock_timestamp() AT TIME ZONE 'America/Montreal')::date;
  d:=CASE WHEN p_input?'target_date' THEN public.training_date(p_input->>'target_date') ELSE today END;
  RETURN jsonb_build_object('schema_version',1,'status','unprovisioned','athlete_timezone','America/Montreal','today',today,'target_date',d,'versions',jsonb_build_object('state',0,'evidence',0),'authority',jsonb_build_object('owner_user_id',NULL,'lifecycle','inactive','revision_id',NULL,'activation_event_id',NULL,'authorized_through',NULL),'direction',NULL,'queue',jsonb_build_object('next_slot_key',NULL,'next_resistance_slot',NULL,'confidence','resolved','basis_event_ids','[]'::jsonb,'qualifying_exposures',0),'activity_eligibility',(SELECT jsonb_object_agg(a,jsonb_build_object('eligible',false,'eligible_on_or_after',NULL,'reasons',jsonb_build_array('UNPROVISIONED'),'conditions','[]'::jsonb)) FROM unnest(ARRAY['strength','cardio','mobility','rest']) a),'recommended_today',NULL,'review',jsonb_build_object('review_due',false,'reasons','[]'::jsonb,'original_due_on',NULL,'last_review',NULL,'handling',NULL,'open_concerns','[]'::jsonb),'evidence',jsonb_build_object('complete',true,'queue_history_complete',true,'sets','[]'::jsonb,'unlinked_sets','[]'::jsonb,'cardio_sessions','[]'::jsonb,'daily_logs','[]'::jsonb,'pending_qualifiers','[]'::jsonb),'sessions','[]'::jsonb,'proposals','[]'::jsonb,'recent_phases','[]'::jsonb,'blocking_reasons',jsonb_build_array('UNPROVISIONED'),'target_conflict',NULL);
 END IF;
 -- Reconcile changed objective evidence without a Finish action or redundant
 -- confirmation. Missing subjective/work identity remains explicitly pending.
 FOR occurrence IN SELECT id FROM public.training_session_contexts LOOP
  evaluated:=public.training_evaluate(occurrence.id);
  SELECT payload INTO previous FROM public.training_plan_events WHERE session_id=occurrence.id AND kind='reconcile' ORDER BY occurred_at DESC,id DESC LIMIT 1;
  IF previous->>'fingerprint' IS DISTINCT FROM evaluated->>'fingerprint' AND
    ((evaluated->>'raw_logged_set_count')::int>0 OR evaluated->>'source' IN ('mixed','self_reported') OR previous IS NOT NULL OR evaluated->>'qualification'='qualifies') THEN
   PERFORM public.training_reconcile(occurrence.id,coalesce(previous->>'outcome','unknown'));
   UPDATE public.training_plan_state SET state_version=state_version+1 WHERE id=1;
  END IF;
 END LOOP;
 PERFORM public.training_sync_review();
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 today:=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date;
 d:=CASE WHEN p_input?'target_date' THEN public.training_date(p_input->>'target_date') ELSE today END;
 SELECT content INTO c FROM public.training_plan_revisions WHERE id=st.active_revision_id;
 SELECT id INTO act FROM public.training_plan_events WHERE kind='activation' AND revision_id=st.active_revision_id ORDER BY occurred_at DESC,id DESC LIMIT 1;
 queue:=public.training_queue();
 FOREACH k IN ARRAY ARRAY['strength','cardio','mobility','rest'] LOOP
  sl:=NULL;
  IF k='strength' THEN sl:=public.training_slot(st.active_revision_id,queue->>'next_resistance_slot');
  ELSIF public.training_slot(st.active_revision_id,queue->>'next_slot_key')->>'activity_kind'=k THEN sl:=public.training_slot(st.active_revision_id,queue->>'next_slot_key'); END IF;
  ev:=public.training_eligibility(d,k,coalesce(sl->'exercises','[]'),sl);
  IF sl IS NULL AND c IS NOT NULL AND NOT(coalesce(c#>'{delegation,supportive_activities}','[]')?k) THEN ev:=ev||jsonb_build_object('eligible',false,'reasons',(ev->'reasons')||'"OUTSIDE_DELEGATED_SCOPE"'::jsonb); END IF;
  activities:=activities||jsonb_build_object(k,ev); can:=can||jsonb_build_object(k,ev->'eligible');
  SELECT blockers||coalesce(jsonb_agg(jsonb_build_object('activity_kind',k,'code',x)),'[]') INTO blockers FROM jsonb_array_elements_text(ev->'reasons') x;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('evaluation',public.training_evaluate(s.id),'cancelled',EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.session_id=s.id AND e.kind='cancel_session'),'prescription_diverged',s.workout_id IS NOT NULL AND public.training_digest(public.training_workout_content(s.workout_id)) IS DISTINCT FROM coalesce((SELECT e.payload->>'accepted_fingerprint' FROM public.training_plan_events e WHERE e.session_id=s.id AND e.kind='deviation' AND e.payload?'accepted_fingerprint' ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1),s.snapshot->>'prescription_fingerprint')) ORDER BY s.planned_date,s.id),'[]') INTO sessions FROM public.training_session_contexts s;
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('outcomes',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at,e.id),'[]') FROM public.training_plan_events e WHERE e.revision_id=r.id AND e.kind IN ('review','concern','deviation'))) ORDER BY r.authored_at,r.id),'[]') INTO revisions FROM public.training_plan_revisions r;
 SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('exercise_name',e.name,'library_deleted',e.is_deleted) ORDER BY s.logged_at,s.id),'[]') INTO rawsets FROM public.sets s JOIN public.exercises e ON e.id=s.exercise_id WHERE NOT s.is_deleted;
 SELECT jsonb_build_object('event_id',e.id,'source_event_id',e.id,'based_on_versions',e.payload->'based_on_versions','stale',e.revision_id IS DISTINCT FROM st.active_revision_id OR (e.payload#>>'{based_on_versions,state}')::bigint IS DISTINCT FROM st.state_version OR (e.payload#>>'{based_on_versions,evidence}')::bigint IS DISTINCT FROM st.evidence_version)||e.payload INTO rec FROM public.training_plan_events e WHERE e.kind='recommendation' AND e.payload->>'target_date'=d::text ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1;
 SELECT to_jsonb(x)||jsonb_build_object('exercises',public.training_workout_content(x.id)) INTO w FROM public.workouts x WHERE x.date=d;
 reviews:=public.training_review();
 RETURN jsonb_build_object('schema_version',1,'status',CASE WHEN st.active_revision_id IS NULL THEN 'inactive' ELSE 'ready' END,'athlete_timezone',st.athlete_timezone,'today',today,'target_date',d,'versions',jsonb_build_object('state',st.state_version,'evidence',st.evidence_version),'authority',jsonb_build_object('owner_user_id',st.owner_user_id,'revision_id',st.active_revision_id,'activation_event_id',act,'lifecycle',st.lifecycle,'authorized_through',c#>'{block,authorized_through}'),'direction',c,'queue',queue,'activity_eligibility',activities,'recommended_today',rec,'needs_coach_decision',rec IS NULL OR coalesce((rec->>'stale')::boolean,false),'review',reviews,'can_prescribe_under_current_direction',can,'blocking_reasons',blockers,'target_conflict',CASE WHEN EXISTS(SELECT 1 FROM public.training_session_contexts WHERE workout_id=(w->>'id')::int) THEN w ELSE NULL END,'target_day_reservation',w,'sessions',sessions,'recent_phases',revisions,'recent_phases_complete',true,'proposals',(SELECT coalesce(jsonb_agg(r),'[]') FROM jsonb_array_elements(revisions) r WHERE NOT EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.revision_id=(r->>'id')::uuid AND e.kind IN ('activation','rejection'))),'evidence',jsonb_build_object('complete',true,'queue_history_complete',true,'window','all retained records','sets',rawsets,'unlinked_sets',(SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(rawsets) x WHERE x->>'training_session_id' IS NULL),'cardio_sessions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.date,x.id),'[]') FROM public.cardio_sessions x WHERE NOT x.is_deleted),'daily_logs',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.date),'[]') FROM public.daily_logs x),'breathwork_sessions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.date,x.id),'[]') FROM public.breathwork_sessions x WHERE NOT x.is_deleted),'pending_qualifiers',(SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',x->>'id','missing_qualifiers',x#>'{evaluation,missing_qualifiers}')),'[]') FROM jsonb_array_elements(sessions) x WHERE x#>>'{evaluation,qualification}'='pending'),'readiness_missingness','Absent observations are unknown; spacing does not certify recovery'),'reserved_load',(SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(sessions) x WHERE x->>'origin'='prescribed' AND x->>'planned_date'>=today::text AND NOT (x->>'cancelled')::boolean));
END $$;
CREATE FUNCTION public.get_training_history(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n int; events jsonb; cur public.training_plan_events; more boolean; rev uuid; sid uuid;
BEGIN
 PERFORM public.training_actor(); PERFORM public.training_keys(p_input,ARRAY['revision_id','session_id','cursor','limit']);
 n:=coalesce((p_input->>'limit')::int,50); IF n<1 OR n>100 THEN PERFORM public.training_fail('INVALID_LIMIT'); END IF;
 rev:=(p_input->>'revision_id')::uuid; sid:=(p_input->>'session_id')::uuid;
 IF p_input->>'cursor' IS NOT NULL THEN SELECT * INTO cur FROM public.training_plan_events WHERE id=(p_input->>'cursor')::uuid; IF NOT FOUND THEN PERFORM public.training_fail('INVALID_CURSOR'); END IF; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at DESC,e.id DESC),'[]') INTO events FROM (SELECT * FROM public.training_plan_events x WHERE (rev IS NULL OR x.revision_id=rev) AND (sid IS NULL OR x.session_id=sid) AND (cur.id IS NULL OR (x.occurred_at,x.id)<(cur.occurred_at,cur.id)) ORDER BY x.occurred_at DESC,x.id DESC LIMIT n+1) e;
 more:=jsonb_array_length(events)>n; IF more THEN events:=events-n; END IF;
 RETURN jsonb_build_object('schema_version',1,'events',events,'has_more',more,'next_cursor',CASE WHEN more THEN events->(n-1)->>'id' ELSE NULL END,'revisions',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.authored_at,r.id),'[]') FROM public.training_plan_revisions r WHERE (rev IS NULL OR r.id=rev) AND (sid IS NULL OR EXISTS(SELECT 1 FROM public.training_session_contexts s WHERE s.id=sid AND s.revision_id=r.id))),'sessions',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.planned_date,s.id),'[]') FROM public.training_session_contexts s WHERE (rev IS NULL OR s.revision_id=rev) AND (sid IS NULL OR s.id=sid)));
END $$;
CREATE FUNCTION public.get_training_request(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.training_plan_events; actor_id text;
BEGIN
 PERFORM public.training_keys(p_input,ARRAY['operation','request_id','payload']); actor_id:=public.training_actor();
 IF p_input->>'request_id' IS DISTINCT FROM p_input#>>'{payload,request_id}' THEN PERFORM public.training_fail('IDEMPOTENCY_CONFLICT'); END IF;
 SELECT * INTO e FROM public.training_plan_events WHERE request_id=(p_input->>'request_id')::uuid AND (actor=actor_id OR (actor_id LIKE 'owner:%' AND actor='coach')) ORDER BY (actor=actor_id) DESC LIMIT 1;
 IF NOT FOUND THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
 IF e.operation IS DISTINCT FROM p_input->>'operation' OR e.request_digest IS DISTINCT FROM public.training_digest(p_input->'payload') THEN PERFORM public.training_fail('IDEMPOTENCY_CONFLICT'); END IF;
 RETURN e.result;
END $$;
CREATE FUNCTION public.propose_training_revision(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb; st public.training_plan_state; rid uuid; eid uuid;
BEGIN
 PERFORM public.training_keys(p_input,ARRAY['request_id','expected_state_version','expected_evidence_version','content','parent_revision_id']);
 replay:=public.training_begin('propose_training_revision',p_input); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 PERFORM public.training_validate_revision(p_input->'content');
 IF p_input->>'parent_revision_id' IS NOT NULL AND (p_input->>'parent_revision_id')::uuid IS DISTINCT FROM st.active_revision_id THEN PERFORM public.training_fail('CONTEXT_CHANGED'); END IF;
 INSERT INTO public.training_plan_revisions(parent_revision_id,schema_version,content,authored_on,timezone,source) VALUES(st.active_revision_id,1,p_input->'content',(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date,st.athlete_timezone,CASE WHEN public.training_actor()='coach' THEN 'coach' ELSE 'owner' END) RETURNING id INTO rid;
 eid:=public.training_event('proposal',rid,NULL,jsonb_build_object('parent_revision_id',st.active_revision_id));
 RETURN public.training_receipt('propose_training_revision',p_input,rid,NULL,jsonb_build_object('decision_event_id',eid,'diff',jsonb_build_object('previous_revision_id',st.active_revision_id,'proposed_content',p_input->'content')));
END $$;
CREATE FUNCTION public.activate_training_revision(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb; st public.training_plan_state; r public.training_plan_revisions; eid uuid; s record;
BEGIN
 PERFORM public.training_actor(true); PERFORM public.training_keys(p_input,ARRAY['request_id','expected_state_version','expected_evidence_version','revision_id','seed_slot_key','pending_intent_action']);
 replay:=public.training_begin('activate_training_revision',p_input); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 SELECT * INTO r FROM public.training_plan_revisions WHERE id=(p_input->>'revision_id')::uuid;
 IF NOT FOUND THEN PERFORM public.training_fail('INVALID_REVISION_REFERENCE'); END IF;
 IF EXISTS(SELECT 1 FROM public.training_plan_events WHERE revision_id=r.id AND kind='rejection') THEN PERFORM public.training_fail('PROPOSAL_REJECTED'); END IF;
 IF r.parent_revision_id IS DISTINCT FROM st.active_revision_id THEN PERFORM public.training_fail('CONTEXT_CHANGED'); END IF;
 IF public.training_slot(r.id,p_input->>'seed_slot_key') IS NULL THEN PERFORM public.training_fail('INVALID_SEED'); END IF;
 IF coalesce(p_input->>'pending_intent_action','') NOT IN ('retain','cancel') THEN PERFORM public.training_fail('PENDING_INTENT_ACTION_REQUIRED'); END IF;
 IF p_input->>'pending_intent_action'='cancel' THEN
  FOR s IN SELECT sc.id,sc.revision_id FROM public.training_session_contexts sc WHERE sc.revision_id=st.active_revision_id AND public.training_evaluate(sc.id)->>'qualification'<>'qualifies' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.session_id=sc.id AND e.kind='cancel_session') LOOP
   PERFORM public.training_event('cancel_session',s.revision_id,s.id,jsonb_build_object('reason','Explicit cancellation on revision activation','replacement_revision_id',r.id));
  END LOOP;
 END IF;
 PERFORM public.training_sync_review(); -- Preserve outgoing due reasons before switching revisions.
 UPDATE public.training_plan_state SET active_revision_id=r.id,lifecycle='active' WHERE id=1;
 eid:=public.training_event('activation',r.id,NULL,p_input-ARRAY['request_id','expected_state_version','expected_evidence_version']);
 PERFORM public.training_sync_review();
 RETURN public.training_receipt('activate_training_revision',p_input,r.id,NULL,jsonb_build_object('activation_event_id',eid));
END $$;
CREATE FUNCTION public.set_training_lifecycle(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb; rid uuid; eid uuid;
BEGIN
 PERFORM public.training_actor(true); PERFORM public.training_keys(p_input,ARRAY['request_id','expected_state_version','expected_evidence_version','lifecycle','reason']);
 replay:=public.training_begin('set_training_lifecycle',p_input); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM public.training_reason(p_input);
 IF coalesce(p_input->>'lifecycle','') NOT IN ('active','paused','archived','inactive') THEN PERFORM public.training_fail('INVALID_LIFECYCLE'); END IF;
 SELECT active_revision_id INTO rid FROM public.training_plan_state WHERE id=1;
 IF rid IS NULL AND p_input->>'lifecycle' IN ('active','paused') THEN PERFORM public.training_fail('AUTHORITY_REQUIRED'); END IF;
 PERFORM public.training_sync_review();
 UPDATE public.training_plan_state SET lifecycle=p_input->>'lifecycle' WHERE id=1;
 eid:=public.training_event('lifecycle',rid,NULL,p_input-ARRAY['request_id','expected_state_version','expected_evidence_version']);
 RETURN public.training_receipt('set_training_lifecycle',p_input,rid,NULL,jsonb_build_object('decision_event_id',eid));
END $$;
CREATE FUNCTION public.record_training_decision(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb; st public.training_plan_state; c jsonb; s public.training_session_contexts; sid uuid; rid uuid; k text; p jsonb; keys text[]; eid uuid; ex jsonb:='{}'; d date; today date; sl jsonb; x jsonb; idn int; report jsonb; actor text; rv jsonb;
BEGIN
 k:=p_input->>'kind';
 keys:=CASE k
 WHEN 'reconcile' THEN ARRAY['session_id','outcome']
 WHEN 'clarify_session' THEN ARRAY['session_id','set_ids','effort_by_set','quality','continuation_dates','cardio_session_ids']
 WHEN 'propose_report' THEN ARRAY['session_id','report','proposal_event_id']
 WHEN 'confirm_report' THEN ARRAY['session_id','report','proposal_event_id','duplicate_checked']
 WHEN 'attribute_occurrence' THEN ARRAY['revision_id','slot_key','performed_on','set_ids','duplicate_checked','distinct_from_session_ids']
 WHEN 'confirm_day' THEN ARRAY['date','non_strength','complete']
 WHEN 'bounded_continuation' THEN ARRAY['review_event_ids','evidence','revisit_on']
 WHEN 'review' THEN ARRAY['review_event_ids','evidence','outcome','next_review_on','next_exposure_threshold','resolve_concern_ids']
 WHEN 'concern' THEN ARRAY['code','activity_kinds','stop','revisit_on']
 WHEN 'deviation' THEN ARRAY['session_id','revisit_on']
 WHEN 'cancel_session' THEN ARRAY['session_id']
 WHEN 'queue_correction' THEN ARRAY['next_slot_key','evidence']
 WHEN 'resolve_report' THEN ARRAY['session_id','resolution']
 WHEN 'reject_revision' THEN ARRAY['revision_id']
 ELSE NULL END;
 IF keys IS NULL THEN PERFORM public.training_fail('UNSUPPORTED_DECISION_KIND'); END IF;
 PERFORM public.training_keys(p_input,keys||ARRAY['kind','reason','request_id','expected_state_version','expected_evidence_version']);
 actor:=public.training_actor(k IN ('clarify_session','confirm_report','attribute_occurrence','confirm_day','cancel_session','queue_correction','resolve_report','reject_revision'));
 replay:=public.training_begin('record_training_decision',p_input); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO st FROM public.training_plan_state WHERE id=1; rid:=st.active_revision_id;
 today:=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date;
 SELECT content INTO c FROM public.training_plan_revisions WHERE id=rid;
 p:=p_input-ARRAY['request_id','expected_state_version','expected_evidence_version'];
 IF k<>'reconcile' THEN PERFORM public.training_reason(p); END IF;
 IF p?'session_id' THEN
  sid:=(p->>'session_id')::uuid; SELECT * INTO s FROM public.training_session_contexts WHERE id=sid;
  IF NOT FOUND THEN PERFORM public.training_fail('INVALID_SESSION_REFERENCE'); END IF;
  rid:=s.revision_id; sl:=s.snapshot->'slot';
 END IF;
 IF k='reconcile' THEN
  ex:=public.training_reconcile(sid,coalesce(p->>'outcome','unknown'));
 ELSIF k='attribute_occurrence' THEN
  rid:=(p->>'revision_id')::uuid; sl:=public.training_slot(rid,p->>'slot_key'); d:=public.training_date(p->>'performed_on');
  IF sl IS NULL OR d>today THEN PERFORM public.training_fail('INVALID_ATTRIBUTION'); END IF;
  IF p->'duplicate_checked' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p->'set_ids') IS DISTINCT FROM 'array' THEN PERFORM public.training_fail('DUPLICATE_CHECK_REQUIRED'); END IF;
  IF EXISTS(SELECT 1 FROM public.training_session_contexts sc WHERE sc.planned_date=d AND sc.slot_key IS NOT NULL AND NOT(coalesce(p->'distinct_from_session_ids','[]')?sc.id::text)) THEN PERFORM public.training_fail('POTENTIAL_DUPLICATE_OCCURRENCE'); END IF;
  INSERT INTO public.training_session_contexts(revision_id,slot_key,cycle_key,planned_date,timezone,activity_kind,load_tags,snapshot,origin,source_state_version,source_evidence_version) VALUES(rid,p->>'slot_key',gen_random_uuid(),d,st.athlete_timezone,sl->>'activity_kind',sl->'load_tags',jsonb_build_object('slot',sl,'original_prescription',NULL,'exercises','[]'::jsonb),'retrospective',st.state_version,st.evidence_version) RETURNING * INTO s;
  sid:=s.id;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'set_ids') LOOP
   idn:=(x#>>'{}')::int;
   IF NOT EXISTS(SELECT 1 FROM public.sets t WHERE t.id=idn AND NOT t.is_deleted AND t.training_session_id IS NULL AND (t.logged_at AT TIME ZONE st.athlete_timezone)::date=d) THEN PERFORM public.training_fail('INVALID_SET_ASSOCIATION'); END IF;
   UPDATE public.sets SET training_session_id=sid WHERE id=idn;
  END LOOP;
  eid:=public.training_event(k,rid,sid,p); ex:=public.training_reconcile(sid);
 ELSIF k='clarify_session' THEN
  IF jsonb_typeof(p->'set_ids') IS DISTINCT FROM 'array' THEN PERFORM public.training_fail('INVALID_SET_IDS'); END IF;
  IF p?'continuation_dates' THEN
   IF jsonb_typeof(p->'continuation_dates')<>'array' THEN PERFORM public.training_fail('INVALID_CONTINUATION'); END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(p->'continuation_dates') LOOP
    d:=public.training_date(x#>>'{}');
    IF d<=s.planned_date OR d>s.planned_date+coalesce((sl#>>'{qualification,continuation_days}')::int,0) OR d>today THEN PERFORM public.training_fail('INVALID_CONTINUATION'); END IF;
   END LOOP;
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'set_ids') LOOP
   idn:=(x#>>'{}')::int;
   IF NOT EXISTS(SELECT 1 FROM public.sets t WHERE t.id=idn AND NOT t.is_deleted AND (t.training_session_id IS NULL OR t.training_session_id=sid) AND ((t.logged_at AT TIME ZONE s.timezone)::date=s.planned_date OR coalesce(p->'continuation_dates','[]')?((t.logged_at AT TIME ZONE s.timezone)::date)::text)) THEN PERFORM public.training_fail('INVALID_SET_ASSOCIATION'); END IF;
   UPDATE public.sets SET training_session_id=sid WHERE id=idn;
  END LOOP;
  IF p?'effort_by_set' THEN
   IF jsonb_typeof(p->'effort_by_set')<>'object' THEN PERFORM public.training_fail('INVALID_EFFORT'); END IF;
   FOR x IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(p->'effort_by_set') LOOP
    IF NOT(p->'set_ids' @> jsonb_build_array((x->>'key')::int)) OR jsonb_typeof(x->'value')<>'number' OR (x->>'value')!~'^\d+$' OR (x->>'value')::int>10 THEN PERFORM public.training_fail('INVALID_EFFORT'); END IF;
   END LOOP;
  END IF;
  IF p?'cardio_session_ids' THEN
   IF jsonb_typeof(p->'cardio_session_ids')<>'array' THEN PERFORM public.training_fail('INVALID_CARDIO_IDS'); END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(p->'cardio_session_ids') LOOP
    idn:=(x#>>'{}')::int;
    IF NOT EXISTS(SELECT 1 FROM public.cardio_sessions cs WHERE cs.id=idn AND NOT cs.is_deleted AND (cs.date=s.planned_date OR coalesce(p->'continuation_dates','[]')?cs.date::text)) OR EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.kind='clarify_session' AND e.session_id<>sid AND e.payload->'cardio_session_ids' @> jsonb_build_array(idn)) THEN PERFORM public.training_fail('INVALID_CARDIO_ASSOCIATION'); END IF;
   END LOOP;
  END IF;
  eid:=public.training_event(k,rid,sid,p); ex:=public.training_reconcile(sid);
 ELSIF k IN ('propose_report','confirm_report') THEN
  report:=p->'report'; PERFORM public.training_keys(report,ARRAY['performed_on','work','minutes','objective_met','quality','load_tags']);
  d:=public.training_date(report->>'performed_on'); IF d<>s.planned_date OR d>today THEN PERFORM public.training_fail('INVALID_REPORT_DATE'); END IF;
  IF report?'work' THEN
   IF jsonb_typeof(report->'work')<>'array' THEN PERFORM public.training_fail('INVALID_REPORT_WORK'); END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(report->'work') LOOP
    PERFORM public.training_keys(x,ARRAY['exercise_id','sets','reps','rir']);
    IF NOT EXISTS(SELECT 1 FROM public.exercises WHERE id=(x->>'exercise_id')::int) OR jsonb_typeof(x->'sets') IS DISTINCT FROM 'number' OR coalesce(x->>'sets','')!~'^\d+$' THEN PERFORM public.training_fail('INVALID_REPORT_WORK'); END IF;
    IF x?'reps' AND (jsonb_typeof(x->'reps')<>'number' OR (x->>'reps')!~'^\d+$') THEN PERFORM public.training_fail('INVALID_REPORT_WORK'); END IF;
    IF x?'rir' AND (jsonb_typeof(x->'rir')<>'number' OR (x->>'rir')!~'^\d+$' OR (x->>'rir')::int>10) THEN PERFORM public.training_fail('INVALID_REPORT_WORK'); END IF;
   END LOOP;
  END IF;
  IF report?'minutes' AND (jsonb_typeof(report->'minutes')<>'number' OR (report->>'minutes')!~'^\d+$') THEN PERFORM public.training_fail('INVALID_REPORT_WORK'); END IF;
  IF report?'objective_met' AND jsonb_typeof(report->'objective_met')<>'boolean' THEN PERFORM public.training_fail('INVALID_REPORT_WORK'); END IF;
  IF report?'load_tags' AND NOT public.training_tags(report->'load_tags') THEN PERFORM public.training_fail('INVALID_LOAD_TAGS'); END IF;
  IF p?'proposal_event_id' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events WHERE id=(p->>'proposal_event_id')::uuid AND session_id=sid AND kind='propose_report' AND payload->'report'=report) THEN PERFORM public.training_fail('INVALID_REPORT_PROPOSAL'); END IF;
  IF k='confirm_report' AND p->'duplicate_checked' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.training_fail('DUPLICATE_CHECK_REQUIRED'); END IF;
  eid:=public.training_event(k,rid,sid,p);
  IF k='confirm_report' THEN ex:=public.training_reconcile(sid); END IF;
 ELSIF k='resolve_report' THEN
  IF coalesce(p->>'resolution','') NOT IN ('use_logs','use_report') OR NOT EXISTS(SELECT 1 FROM public.training_plan_events WHERE session_id=sid AND kind='confirm_report') THEN PERFORM public.training_fail('INVALID_REPORT_RESOLUTION'); END IF;
  p:=p||jsonb_build_object('evidence_fingerprint',public.training_evaluate(sid)->>'evidence_fingerprint');
  eid:=public.training_event(k,rid,sid,p); ex:=public.training_reconcile(sid);
 ELSIF k='confirm_day' THEN
  d:=public.training_date(p->>'date');
  IF d>=today OR p->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p->'non_strength') IS DISTINCT FROM 'boolean' THEN PERFORM public.training_fail('INCOMPLETE_DAY'); END IF;
  eid:=public.training_event(k,rid,NULL,p);
 ELSIF k IN ('bounded_continuation','review') THEN
  IF rid IS NULL OR jsonb_typeof(p->'review_event_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'evidence') IS DISTINCT FROM 'object' THEN PERFORM public.training_fail('INVALID_REVIEW'); END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'review_event_ids') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.training_plan_events WHERE id=(x#>>'{}')::uuid AND kind='review_due') THEN PERFORM public.training_fail('INVALID_REVIEW_REFERENCE'); END IF;
  END LOOP;
  IF k='bounded_continuation' THEN
   d:=public.training_date(p->>'revisit_on');
   IF d<=today OR d>today+(c#>>'{delegation,bounded_continuation_days}')::int THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  ELSE
   IF coalesce(p->>'outcome','') NOT IN ('continue','extend_expected_window','revise','pause','complete','retire') THEN PERFORM public.training_fail('INVALID_REVIEW_OUTCOME'); END IF;
   IF actor='coach' AND (c#>'{delegation,routine_review}' IS DISTINCT FROM 'true'::jsonb OR p->>'outcome' NOT IN ('continue','extend_expected_window')) THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
   d:=public.training_date(p->>'next_review_on'); IF d<=today THEN PERFORM public.training_fail('INVALID_REVIEW_CHECKPOINT'); END IF;
   IF p?'next_exposure_threshold' AND (jsonb_typeof(p->'next_exposure_threshold')<>'number' OR (p->>'next_exposure_threshold')!~'^[1-9]\d*$') THEN PERFORM public.training_fail('INVALID_REVIEW_CHECKPOINT'); END IF;
   IF p?'resolve_concern_ids' THEN
    IF jsonb_typeof(p->'resolve_concern_ids')<>'array' THEN PERFORM public.training_fail('INVALID_CONCERN_REFERENCE'); END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(p->'resolve_concern_ids') LOOP
     IF NOT EXISTS(SELECT 1 FROM public.training_plan_events WHERE id=(x#>>'{}')::uuid AND kind='concern') THEN PERFORM public.training_fail('INVALID_CONCERN_REFERENCE'); END IF;
    END LOOP;
   END IF;
   IF p->>'outcome' IN ('pause','complete','retire') THEN UPDATE public.training_plan_state SET lifecycle=CASE WHEN p->>'outcome'='pause' THEN 'paused' ELSE 'archived' END WHERE id=1; END IF;
  END IF;
  eid:=public.training_event(k,rid,NULL,p);
 ELSIF k='concern' THEN
  IF NOT public.training_text(p->'code') OR jsonb_typeof(p->'activity_kinds') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'stop') IS DISTINCT FROM 'boolean' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'activity_kinds') a WHERE a NOT IN ('strength','cardio','mobility','rest')) THEN PERFORM public.training_fail('INVALID_CONCERN'); END IF;
  IF p->'stop'='true'::jsonb AND NOT(coalesce(c#>'{delegation,stop_conditions}','[]')? (p->>'code')) THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  IF p?'revisit_on' THEN PERFORM public.training_date(p->>'revisit_on'); END IF;
  eid:=public.training_event(k,rid,NULL,p); PERFORM public.training_sync_review();
 ELSIF k='deviation' THEN
  IF actor='coach' AND c#>'{delegation,substitutions}' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  d:=public.training_date(p->>'revisit_on'); IF d<today THEN PERFORM public.training_fail('INVALID_REVISIT'); END IF;
  eid:=public.training_event(k,rid,sid,p);
  PERFORM public.training_event('concern',rid,sid,jsonb_build_object('code','deviation_review','reason',p->>'reason','stop',false,'activity_kinds',jsonb_build_array(s.activity_kind),'revisit_on',d));
  PERFORM public.training_sync_review();
 ELSIF k='cancel_session' THEN
  eid:=public.training_event(k,rid,sid,p);
 ELSIF k='reject_revision' THEN
  rid:=(p->>'revision_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.training_plan_revisions WHERE id=rid) OR EXISTS(SELECT 1 FROM public.training_plan_events WHERE revision_id=rid AND kind='activation') THEN PERFORM public.training_fail('INVALID_PROPOSAL_REFERENCE'); END IF;
  eid:=public.training_event('rejection',rid,NULL,p);
 ELSIF k='queue_correction' THEN
  IF public.training_slot(rid,p->>'next_slot_key') IS NULL OR jsonb_typeof(p->'evidence') IS DISTINCT FROM 'object' THEN PERFORM public.training_fail('INVALID_QUEUE_CORRECTION'); END IF;
  eid:=public.training_event(k,rid,NULL,p);
 END IF;
 RETURN public.training_receipt('record_training_decision',p_input,rid,sid,jsonb_build_object('decision_event_id',eid)||ex);
END $$;
CREATE FUNCTION public.materialize_training_session(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb; st public.training_plan_state; c jsonb; sl jsonb; ex jsonb; ev jsonb; d date; today date; sid uuid; wid int; eid uuid; q jsonb; x jsonb; i int:=0; revisit date;
BEGIN
 PERFORM public.training_keys(p_input,ARRAY['request_id','expected_state_version','expected_evidence_version','target_date','activity_kind','slot_key','reason','revisit_on','exercises','duration_minutes','intensity']);
 replay:=public.training_begin('materialize_training_session',p_input); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO st FROM public.training_plan_state WHERE id=1; SELECT content INTO c FROM public.training_plan_revisions WHERE id=st.active_revision_id;
 PERFORM public.training_reason(p_input); d:=public.training_date(p_input->>'target_date'); revisit:=public.training_date(p_input->>'revisit_on'); today:=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date;
 IF d<today THEN PERFORM public.training_fail('DATE_NOT_EDITABLE'); END IF;
 IF revisit<today THEN PERFORM public.training_fail('INVALID_REVISIT'); END IF;
 IF coalesce(p_input->>'activity_kind','') NOT IN ('strength','cardio','mobility','rest') THEN PERFORM public.training_fail('INVALID_ACTIVITY_KIND'); END IF;
 IF p_input->>'slot_key' IS NOT NULL THEN
  sl:=public.training_slot(st.active_revision_id,p_input->>'slot_key');
  IF sl IS NULL OR sl->>'activity_kind'<>p_input->>'activity_kind' THEN PERFORM public.training_fail('INVALID_SLOT'); END IF;
 END IF;
 ex:=coalesce(p_input->'exercises',sl->'exercises','[]'); PERFORM public.training_exercises(ex);
 ev:=public.training_check_prescription(d,p_input->>'activity_kind',ex,sl);
 q:=public.training_queue();
 IF sl IS NOT NULL THEN
  IF sl->>'key' IS DISTINCT FROM q->>'next_slot_key' THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  IF ex<>sl->'exercises' THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  IF EXISTS(SELECT 1 FROM public.training_session_contexts sc WHERE sc.slot_key IS NOT NULL AND sc.origin='prescribed' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.session_id=sc.id AND e.kind='cancel_session') AND public.training_evaluate(sc.id)->>'qualification'<>'qualifies') THEN PERFORM public.training_fail('PENDING_SESSION_CONFLICT'); END IF;
 ELSIF NOT(coalesce(c#>'{delegation,supportive_activities}','[]')?(p_input->>'activity_kind')) THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE');
 END IF;
 IF sl IS NULL AND ev->'evaluated_load_tags'?'resistance' THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
 IF p_input->>'activity_kind'='rest' AND jsonb_array_length(ex)>0 THEN PERFORM public.training_fail('INVALID_REST_PRESCRIPTION'); END IF;
 IF sl IS NULL AND p_input->>'activity_kind'='cardio' THEN
  IF jsonb_typeof(p_input->'duration_minutes') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'intensity') IS DISTINCT FROM 'number' OR (p_input->>'duration_minutes')::numeric<=0 OR (p_input->>'intensity')::numeric<1 OR (p_input->>'intensity')::numeric>10 OR c#>>'{delegation,supportive_constraints,cardio_max_minutes}' IS NULL OR c#>>'{delegation,supportive_constraints,cardio_max_intensity}' IS NULL OR (p_input->>'duration_minutes')::numeric>(c#>>'{delegation,supportive_constraints,cardio_max_minutes}')::numeric OR (p_input->>'intensity')::numeric>(c#>>'{delegation,supportive_constraints,cardio_max_intensity}')::numeric THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.training_session_contexts sc WHERE sc.planned_date=d AND sc.activity_kind=p_input->>'activity_kind' AND NOT EXISTS(SELECT 1 FROM public.training_plan_events e WHERE e.session_id=sc.id AND e.kind='cancel_session')) THEN PERFORM public.training_fail('WORKOUT_CONFLICT'); END IF;
 IF jsonb_array_length(ex)>0 THEN
  IF EXISTS(SELECT 1 FROM public.workouts WHERE date=d) THEN PERFORM public.training_fail('WORKOUT_CONFLICT'); END IF;
  INSERT INTO public.workouts(date,name,note) VALUES(d,coalesce(sl->>'purpose',p_input->>'activity_kind'),p_input->>'reason') RETURNING id INTO wid;
  FOR x IN SELECT value FROM jsonb_array_elements(ex) LOOP
   INSERT INTO public.workouts_exercises(workout_id,exercise_id,sort_order,details,note) VALUES(wid,(x->>'exercise_id')::int,i,x->>'details',x->>'note'); i:=i+1;
  END LOOP;
 END IF;
 INSERT INTO public.training_session_contexts(revision_id,slot_key,cycle_key,planned_date,timezone,activity_kind,load_tags,resistance_slot_key,workout_id,snapshot,origin,source_state_version,source_evidence_version)
 VALUES(st.active_revision_id,sl->>'key',gen_random_uuid(),d,st.athlete_timezone,p_input->>'activity_kind',ev->'evaluated_load_tags',q->>'next_resistance_slot',wid,jsonb_build_object('slot',sl,'revision',c,'exercises',public.training_frozen_exercises(ex),'intent',p_input-ARRAY['request_id','expected_state_version','expected_evidence_version'],'prescription_fingerprint',CASE WHEN wid IS NOT NULL THEN public.training_digest(public.training_workout_content(wid)) ELSE NULL END),'prescribed',st.state_version,st.evidence_version) RETURNING id INTO sid;
 SELECT * INTO st FROM public.training_plan_state WHERE id=1;
 eid:=public.training_event('recommendation',st.active_revision_id,sid,jsonb_build_object('target_date',d,'activity_kind',p_input->>'activity_kind','reason',p_input->>'reason','revisit_on',revisit,'resistance_queue_effect','hold','eligibility',ev,'based_on_versions',jsonb_build_object('state',st.state_version+1,'evidence',st.evidence_version)));
 RETURN public.training_receipt('materialize_training_session',p_input,st.active_revision_id,sid,jsonb_build_object('workout_id',wid,'decision_event_id',eid));
END $$;
CREATE FUNCTION public.mutate_training_workout(p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE replay jsonb; st public.training_plan_state; a jsonb; op text; d date; wid int; weid int; s public.training_session_contexts; ex jsonb; oldex jsonb; eid uuid; c jsonb; sl jsonb; x jsonb; linked boolean; revisit date;
BEGIN
 PERFORM public.training_keys(p_input,ARRAY['request_id','expected_state_version','expected_evidence_version','operation','args','mode','reason','revisit_on']);
 replay:=public.training_begin('mutate_training_workout',p_input); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT * INTO st FROM public.training_plan_state WHERE id=1; SELECT content INTO c FROM public.training_plan_revisions WHERE id=st.active_revision_id;
 a:=p_input->'args'; op:=p_input->>'operation';
 IF op='create_or_update_workout' THEN PERFORM public.training_keys(a,ARRAY['date','name','note']);
 ELSIF op='add_workout_exercise' THEN PERFORM public.training_keys(a,ARRAY['date','exercise_id','details','note','sort_order']);
 ELSIF op='update_workout_exercise' THEN PERFORM public.training_keys(a,ARRAY['workout_exercise_id','details','note','sort_order']);
 ELSIF op='remove_workout_exercise' THEN PERFORM public.training_keys(a,ARRAY['workout_exercise_id']);
 ELSE PERFORM public.training_fail('INVALID_OPERATION'); END IF;
 IF coalesce(p_input->>'mode','') NOT IN ('linked','freeform') THEN PERFORM public.training_fail('EXPLICIT_MODE_REQUIRED'); END IF;
 PERFORM public.training_reason(p_input);
 IF op IN ('update_workout_exercise','remove_workout_exercise') THEN
  SELECT w.id,w.date,we.id INTO wid,d,weid FROM public.workouts_exercises we JOIN public.workouts w ON w.id=we.workout_id WHERE we.id=(a->>'workout_exercise_id')::int FOR UPDATE OF w,we;
  IF NOT FOUND THEN PERFORM public.training_fail('INVALID_WORKOUT_EXERCISE'); END IF;
 ELSE d:=public.training_date(a->>'date'); SELECT id INTO wid FROM public.workouts WHERE date=d FOR UPDATE; END IF;
 IF d<(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date THEN PERFORM public.training_fail('DATE_NOT_EDITABLE'); END IF;
 SELECT * INTO s FROM public.training_session_contexts WHERE workout_id=wid ORDER BY created_at DESC,id DESC LIMIT 1;
 linked:=s.id IS NOT NULL;
 IF linked AND (p_input->>'mode'<>'linked' OR s.revision_id IS DISTINCT FROM st.active_revision_id OR EXISTS(SELECT 1 FROM public.training_plan_events WHERE session_id=s.id AND kind='cancel_session')) THEN PERFORM public.training_fail('WORKOUT_CONFLICT'); END IF;
 IF NOT linked AND p_input->>'mode'='linked' THEN PERFORM public.training_fail('WORKOUT_CONFLICT'); END IF;
 IF linked THEN
  IF c#>'{delegation,substitutions}' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  revisit:=public.training_date(p_input->>'revisit_on'); IF revisit<d THEN PERFORM public.training_fail('INVALID_REVISIT'); END IF;
  sl:=s.snapshot->'slot';
 END IF;
 oldex:=public.training_workout_content(wid);
 IF wid IS NULL THEN INSERT INTO public.workouts(date) VALUES(d) RETURNING id INTO wid; END IF;
 IF op='create_or_update_workout' THEN
  UPDATE public.workouts SET name=CASE WHEN a?'name' THEN a->>'name' ELSE name END,note=CASE WHEN a?'note' THEN a->>'note' ELSE note END WHERE id=wid;
 ELSIF op='add_workout_exercise' THEN
  IF NOT EXISTS(SELECT 1 FROM public.exercises WHERE id=(a->>'exercise_id')::int AND NOT is_deleted) THEN PERFORM public.training_fail('INVALID_EXERCISE_REFERENCE'); END IF;
  INSERT INTO public.workouts_exercises(workout_id,exercise_id,details,note,sort_order) VALUES(wid,(a->>'exercise_id')::int,a->>'details',a->>'note',coalesce((a->>'sort_order')::int,(SELECT coalesce(max(sort_order)+1,0) FROM public.workouts_exercises WHERE workout_id=wid))) RETURNING id INTO weid;
 ELSIF op='update_workout_exercise' THEN
  UPDATE public.workouts_exercises SET details=CASE WHEN a?'details' THEN a->>'details' ELSE details END,note=CASE WHEN a?'note' THEN a->>'note' ELSE note END,sort_order=CASE WHEN a?'sort_order' THEN (a->>'sort_order')::int ELSE sort_order END WHERE id=weid;
 ELSE DELETE FROM public.workouts_exercises WHERE id=weid; END IF;
 ex:=public.training_workout_content(wid);
 PERFORM public.training_check_prescription(d,CASE WHEN linked THEN s.activity_kind ELSE 'mobility' END,ex,sl,linked);
 IF linked THEN
  -- A boolean delegation is not permission to change enduring anchors. Each
  -- required anchor/equivalent must remain in the resulting prescription.
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(sl#>'{qualification,anchors}','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ex) e WHERE x->'exercise_ids' @> jsonb_build_array((e->>'exercise_id')::int)) THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(ex) e WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(sl->'exercises','[]')) approved WHERE approved->>'exercise_id'=e->>'exercise_id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(sl#>'{qualification,anchors}','[]')) anchor WHERE anchor->'exercise_ids' @> jsonb_build_array((e->>'exercise_id')::int))) THEN PERFORM public.training_fail('OUTSIDE_DELEGATED_SCOPE'); END IF;
  eid:=public.training_event('deviation',s.revision_id,s.id,jsonb_build_object('reason',p_input->>'reason','revisit_on',revisit,'previous_prescription',oldex,'accepted_prescription',public.training_frozen_exercises(ex),'accepted_fingerprint',public.training_digest(ex),'operation',op));
  IF revisit<=(clock_timestamp() AT TIME ZONE st.athlete_timezone)::date OR (SELECT count(*) FROM public.training_plan_events WHERE session_id=s.id AND kind='deviation')>1 THEN
   PERFORM public.training_event('concern',s.revision_id,s.id,jsonb_build_object('code','deviation_review','reason',p_input->>'reason','stop',false,'activity_kinds',jsonb_build_array(s.activity_kind),'revisit_on',revisit));
   PERFORM public.training_sync_review();
  END IF;
 END IF;
 RETURN public.training_receipt('mutate_training_workout',p_input,st.active_revision_id,s.id,jsonb_build_object('workout_id',wid,'workout_exercise_id',weid,'decision_event_id',eid,'planning_enforcement',CASE WHEN st.lifecycle IN ('active','paused') OR linked THEN 'checked' ELSE 'not_applicable' END));
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'training\_%' ESCAPE '\' OR p.proname IN ('get_training_context','get_training_history','get_training_request','propose_training_revision','activate_training_revision','set_training_lifecycle','record_training_decision','materialize_training_session','mutate_training_workout')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
