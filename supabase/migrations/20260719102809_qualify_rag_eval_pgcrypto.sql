-- The initial production migration locked function resolution to an empty
-- search path. Add only the trusted pgcrypto extension schema so the already
-- deployed checksum bodies resolve digest; the canonical migration qualifies
-- the calls explicitly for clean installations.
alter function public.review_ai_eval_case(uuid,text,numeric,numeric,text)
  set search_path to '', extensions;
alter function public.freeze_ai_eval_dataset(uuid,boolean)
  set search_path to '', extensions;
alter function public.start_ai_eval_run(uuid,text,text,text,text,text,integer,uuid)
  set search_path to '', extensions;
