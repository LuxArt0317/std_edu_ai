alter table public.ai_audit_logs
  drop constraint if exists ai_audit_logs_use_case_check;

alter table public.ai_audit_logs
  add constraint ai_audit_logs_use_case_check
  check (use_case in ('answer', 'brief', 'draft', 'action'));

comment on constraint ai_audit_logs_use_case_check on public.ai_audit_logs is
  'Action entries contain only action category metadata and outcome; prompts and payload values are never stored.';
