-- Cover every Issue #124 relationship from both join directions.
create index ai_eval_datasets_owner_idx on public.ai_eval_datasets(owner_profile_id);
create index ai_eval_versions_frozen_by_idx on public.ai_eval_dataset_versions(frozen_by) where frozen_by is not null;
create index ai_eval_cases_author_idx on public.ai_eval_cases(author_id) where author_id is not null;
create index ai_eval_cases_reviewed_by_idx on public.ai_eval_cases(reviewed_by) where reviewed_by is not null;
create index ai_eval_reviews_reviewer_idx on public.ai_eval_case_reviews(reviewer_id);
create index ai_eval_runs_requested_by_idx on public.ai_eval_runs(requested_by,created_at desc);
create index ai_eval_runs_baseline_idx on public.ai_eval_runs(baseline_run_id) where baseline_run_id is not null;
create index ai_eval_results_answer_idx on public.ai_eval_results(answer_id) where answer_id is not null;
