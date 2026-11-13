-- Public reference snapshots independently verified through the university search.
create table public.affairs_course_substitution_snapshots (
  cohort text not null check (cohort ~ '^[0-9]{3}$'),
  track_key text not null check (track_key ~ '^([1-9]|1[0-5])$'),
  department_code text not null check (department_code ~ '^[A-Z0-9]{1,8}$'),
  department_name text not null check (length(department_name) between 1 and 120),
  courses jsonb not null check (
    jsonb_typeof(courses) = 'array' and jsonb_array_length(courses) <= 300
    and octet_length(courses::text) <= 262144
  ),
  observed_on date not null default date '2026-11-14',
  primary key (cohort, track_key, department_code)
);
alter table public.affairs_course_substitution_snapshots enable row level security;
revoke all on public.affairs_course_substitution_snapshots from public, anon, authenticated;
grant select on public.affairs_course_substitution_snapshots to anon, authenticated;
create policy course_substitution_snapshots_public_read
  on public.affairs_course_substitution_snapshots for select to anon, authenticated using (true);

insert into public.affairs_course_substitution_snapshots
  (cohort, track_key, department_code, department_name, courses) values
  ('110', '1', '01', '資管系', '[{"code":"IMU07302","name":"程式設計Ⅰ","credits":"1","detailStatus":"listed","groups":[{"label":"1","courses":[{"code":"IMU07201","name":"程式設計","credits":"3","required":"必","notes":"115.05.05(114-2第3次程委員會通過"}]}]},{"code":"IMU07402","name":"程式設計Ⅱ","credits":"1","detailStatus":"unlisted","groups":[]},{"code":"IMU08002","name":"經濟學","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU18701","name":"程式設計Ⅳ","credits":"1","detailStatus":"unlisted","groups":[]},{"code":"IMU18801","name":"程式設計V","credits":"1","detailStatus":"unlisted","groups":[]},{"code":"IMU18901","name":"程式設計Ⅵ","credits":"1","detailStatus":"unlisted","groups":[]},{"code":"IMU17604","name":"網頁設計","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU06403","name":"統計學","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU08301","name":"資料庫","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU11302","name":"管理資訊系統","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU03401","name":"系統分析與設計","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU05604","name":"實務專題I","credits":"1","detailStatus":"none","groups":[]},{"code":"IMU10001","name":"電子商務","credits":"3","detailStatus":"none","groups":[]},{"code":"IMU05704","name":"實務專題Ⅱ","credits":"1","detailStatus":"none","groups":[]},{"code":"IMU05803","name":"實務專題Ⅲ","credits":"1","detailStatus":"none","groups":[]},{"code":"IMU21902","name":"資管實習","credits":"3","detailStatus":"none","groups":[]}]'::jsonb),
  ('113', '1', '01', '資管系', '[{"code":"IMU05604","name":"實務專題I","credits":"1","detailStatus":"none","groups":[]},{"code":"IMU05704","name":"實務專題Ⅱ","credits":"1","detailStatus":"none","groups":[]},{"code":"IMU05803","name":"實務專題Ⅲ","credits":"1","detailStatus":"none","groups":[]}]'::jsonb),
  ('115', '1', '01', '資管系', '[]'::jsonb);
