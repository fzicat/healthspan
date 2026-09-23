-- Disposable engine assertions; run after the additive migrations, not production.
DO $$
BEGIN
  ASSERT (SELECT count(*) = 4 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('training_plan_state','training_plan_revisions','training_session_contexts','training_plan_events')), 'four planning tables';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sets' AND column_name='training_session_id' AND data_type='uuid' AND is_nullable='YES'), 'nullable occurrence association';
  ASSERT NOT has_table_privilege('service_role','public.training_plan_events','INSERT'), 'service role direct event insert forbidden';
  ASSERT NOT has_table_privilege('authenticated','public.training_plan_state','UPDATE'), 'owner application direct state mutation forbidden';
  ASSERT NOT has_function_privilege('anon','public.activate_training_revision(jsonb)','EXECUTE'), 'anonymous execute forbidden';
END $$;
