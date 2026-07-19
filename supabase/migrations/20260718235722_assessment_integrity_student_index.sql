create index if not exists assessment_integrity_student_idx
  on public.assessment_integrity_events(student_profile_id, occurred_at desc);
