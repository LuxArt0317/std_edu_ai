alter table public.attendance_correction_requests
  drop constraint if exists attendance_correction_requests_attendance_record_id_student_pr_key;

create unique index if not exists attendance_correction_one_pending_idx
  on public.attendance_correction_requests(attendance_record_id, student_profile_id)
  where status = 'pending';
