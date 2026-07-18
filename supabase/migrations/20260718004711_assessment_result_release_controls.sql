alter table public.assessments add column if not exists release_explanations boolean not null default false, add column if not exists release_scores_immediately boolean not null default true;
comment on column public.assessments.release_explanations is 'Teacher-controlled release; question explanations remain hidden from learners unless true.';
