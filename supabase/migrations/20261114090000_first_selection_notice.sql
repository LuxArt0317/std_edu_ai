-- Published schedule captured from the signed-in university notice. Public reference data only.
create table public.affairs_first_selection_notices (
  academic_year integer not null check (academic_year between 100 and 999),
  semester smallint not null check (semester in (1, 2)),
  observed_on date not null,
  notices text[] not null check (cardinality(notices) between 1 and 10 and octet_length(notices::text) <= 12000),
  reminders text[] not null check (cardinality(reminders) between 1 and 10 and octet_length(reminders::text) <= 12000),
  fee_notes text[] not null check (cardinality(fee_notes) between 1 and 10 and octet_length(fee_notes::text) <= 12000),
  fee_notes_en text[] not null check (cardinality(fee_notes_en) = cardinality(fee_notes) and octet_length(fee_notes_en::text) <= 12000),
  primary key (academic_year, semester)
);

create table public.affairs_first_selection_windows (
  academic_year integer not null,
  semester smallint not null,
  phase smallint not null check (phase between 1 and 3),
  opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  audience text not null check (char_length(audience) between 1 and 200),
  audience_en text not null check (char_length(audience_en) between 1 and 200),
  details text not null check (char_length(details) between 1 and 600),
  primary key (academic_year, semester, phase),
  foreign key (academic_year, semester)
    references public.affairs_first_selection_notices(academic_year, semester)
);

alter table public.affairs_first_selection_notices enable row level security;
alter table public.affairs_first_selection_windows enable row level security;
revoke all on public.affairs_first_selection_notices, public.affairs_first_selection_windows from public, anon, authenticated;
grant select on public.affairs_first_selection_notices, public.affairs_first_selection_windows to anon, authenticated;
create policy first_selection_notices_read on public.affairs_first_selection_notices
  for select to anon, authenticated using (true);
create policy first_selection_windows_read on public.affairs_first_selection_windows
  for select to anon, authenticated using (true);

insert into public.affairs_first_selection_notices (academic_year, semester, observed_on, notices, reminders, fee_notes, fee_notes_en) values
  (115, 1, date '2026-11-14',
   array[
    '各系會預排部分必修課程。請自行加選未排入的科目，並退選已抵免或無須修習的課程。退選原先灌堂的課程後，將失去該課程的優先設定。',
    '初選採登記制，優先保障本系及本學制學生。登記後還須經過篩選與抽籤。',
    '篩選條件包括年級、院系所、學制、重複修習及先修成績。第一學期初選會優先保留一年級課程給新生。',
    '符合條件的人數超過課程上限時，依開放年級的順序抽籤，同年級則隨機抽籤。'
   ],
   array[
    '選課前先確認畢業條件並優先選擇必修課程，選課後再確認結果。',
    '請於期限內自行完成選課。因委託他人或疏忽造成的錯誤，逾期無法更改。',
    '延修生及進修部學生的費用計算至加退選結束，棄選課程仍須繳費。跨學制選課可能須補繳差額。',
    '選課問題請洽教務處註冊課務組，電話 (07) 615-8000 轉 2009、2010、2012 或 2016，或寄信至 course@stu.edu.tw。'
   ],
   array[
    '四技、二技及二專進修部以預計每學期學分數與每學分收費計算預收學分學雜費。加退選結束後一個月內結算，當學期補繳或退還差額。',
    '零學分課程按授課時數收費，每小時費率依學分學雜費標準計算。',
    '棄選在期中考後辦理。由於課程已授課、師資及設備成本已支出，棄選學分仍須繳費。'
   ],
   array[
    'Continuing-education programs calculate a prepayment using expected credits and the per-credit fee. They settle differences within one month after add/drop ends.',
    'Zero-credit classes are charged by teaching hours at the per-credit fee rate.',
    'Withdrawing after the midterm still incurs course fees.'
   ]);

insert into public.affairs_first_selection_windows
  (academic_year, semester, phase, opens_at, closes_at, audience, audience_en, details) values
  (115, 1, 1, '2026-06-08 10:00:00+08', '2026-06-18 09:00:00+08',
   '全校在學生', 'All continuing students', '必修科目依各系課程表預先排入清單。未排入的體育、專題或個別指導等課程，請自行加選。'),
  (115, 1, 2, '2026-08-04 10:00:00+08', '2026-08-10 09:00:00+08',
   '轉系、轉學生、雙主修、輔系、延修、復學生', 'Approved transfers, double-major and minor students, extended-study and returning students', '適用於 115-1 獲准轉系、修讀雙主修或輔系，以及轉入、復學或延修的學生。'),
  (115, 1, 3, '2026-08-30 10:00:00+08', '2026-09-03 09:00:00+08',
   '1年級新生、1年級復學生', 'First-year new and returning students', '新生選課說明會資訊見');
