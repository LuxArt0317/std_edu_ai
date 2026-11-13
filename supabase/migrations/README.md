# Database migrations

`20261114090000_first_selection_notice.sql` stores the dated first-selection notice and three separate phase windows. Application roles have read-only RLS access to this reference data. Student selections and account history remain in their existing private tables.

`20261112120000_assistant_conversations.sql` adds owner-only chats with optimistic versions and a 100-chat quota, private reviewed-action replay receipts, and an optional preferred display name. Existing task/request/admin-announcement business functions remain authoritative. New profile/DTM-tracker actions enforce ownership, expected previous values and personal-only assignment scope. The independent migration does not require concurrent academic110000/graduation130000 drafts.


Files run in timestamp order through the root `db:plan` and `db:deploy` commands. Each pending migration is applied in a transaction and recorded in `supabase_migrations.schema_migrations`. Do not edit an applied migration or reset the client database. `20261106010000_affairs_academic_records.sql` adds site-owned sample school records and an audited, owner-only manager RPC. `20261106020000_affairs_manager_hardening.sql` keeps that manager within sample students, sections and enrollments if verified records are imported later. Neither migration imports university SIS or Moodle data.

Migration `20261112010000_student_workspace.sql` adds account-owned meetings, grades and service records, with RLS, same-course assignment links and audited writes. A shared request summary is created only when the owner asks for stu.best review.

Migration `20261112020000_leave_application_fields.sql` adds the remaining observed leave categories, contact phone and the mental health leave time period. The account-only service-record RPC validates and stores these fields. Staff review receives a summary with dates and class periods.

`20261112030000_scholarship_applications.sql` adds RLS-protected local demonstration periods and account applications, with private idempotency receipts and audited RPC-only writes. Period publishing/review requires the verified site administrator. Student edits require an open window and an unreviewed application. Actor/period/application locks and version checks serialize competing actions. There is no automatic period or award seed.

`20261112040000_student_aid_records.sql` adds private student-aid records and admin-only, audited versioned writes. It rejects complete identity numbers and keeps unknown amounts nullable. `20261112050000_course_catalog.sql` adds authenticated local offering search and admin publishing independently of account enrollments. `20261112060000_housing_records.sql` adds published application windows, private consent snapshots/receipts and room assignments, with server deadline checks, immutable ownership, duplicate guards and retry receipts. These tables contain no imported university personal records.

`20261112070000_course_syllabus.sql` adds validated structured syllabi to local catalog offerings: objectives, grading, learning outcomes, SDGs and 18 teaching weeks. Published offerings remain independent of enrollment. Migrations0400–0700 were applied to the client on 2026-11-12; subsequent schema corrections require a new migration.

`20261112100000_course_selection_history.sql` adds private course-selection snapshots for native11-1/11-2. Google-identity RLS restricts reads; versioned admin-only writes atomically validate all meeting slots, reject ownership changes and keep durable replay receipts/audits. No selection history is inferred or imported from enrollment or official personal records.
## Native academic migrations

Migrations `20261112110000`, `20261112130000` and `20261112140000` add eight account-owned academic tables with RLS, admin-only audited writes and durable retry receipts. They keep academic transcripts, graduation report kinds and attendance separate from personal Moodle tracker data. Exact client planning and rollback preflight evidence are recorded in [academic QA](../../docs/qa/ACADEMIC_RESULTS.md); never reset the database to apply them.

`20261112150000` adds independent DTM file submissions/reviews and a private Storage bucket; `20261112160000` adds account-owned certificate assessments and inert document metadata. Both are applied to the verified client project. Versioned RPCs, retry receipts and RLS preserve ownership; do not substitute personal tracker status for file or document issuance.

Migration20261112190000 aligns the conversation SQL content ceiling with the application while preserving ownership, replay/stale checks, payload/quota limits and function grants. It was applied alone after rollback preflight and an exact deployment plan;200000 student conduct was subsequently applied and verified separately.

Migration200000 adds private local conduct snapshots with own-account RLS, audited administrator writes and durable retry receipts. Its rollback preflight passed at129/146; permanent application and actual-JWT local/production acceptance passed. [Conduct scope](../../docs/qa/STUDENT_CONDUCT.md).

Migration210000 adds private loan metadata, an active-account singleton, literal state/count/text validation, audited versioned RPCs and tombstones. It does not issue a loan, approval, payment or document. [Student Loan QA](../../docs/qa/STUDENT_LOAN.md).

Migration220000 adds one active private dormitory-conduct metadata record per account, explicit unknown/empty states, own-account RLS and audited administrator operations with immutable ownership and terminal tombstones. It was applied after the exact client plan on November13 at132 migrations/149 public RLS tables. See [Dormitory Conduct QA](../../docs/qa/DORMITORY_CONDUCT.md).

`20261113230000_dtm_dashboard_layout.sql` adds one owner-only built-in layout table and private command receipts. Only the three observed block IDs and their visibility, region and weight are accepted. RPC-only writes serialize by owner, compare versions and retain exact retries across resets. No administrator bypass, HTML content or course mutation is added. Applied alone after independent rollback preflight and the exact client migration plan.

`20261114000000_dtm_grade_reports.sql` adds one active literal report per owned DTM course, private operation receipts and exact owner/admin RPCs. An owner/course composite foreign key and immutable identity protect linkage; students only read their own reports, and all maintenance is audited. Existing numeric grade tables and policies are unchanged. Deployment state is recorded in [grade-report QA](../../docs/qa/DTM_GRADE_REPORTS.md).

`20261114010000_dtm_course_content.sql` adds owned course content references, immutable identities, owner-only reads, guarded admin RPCs, tombstones, version checks and private operation receipts. It leaves existing activity/grade/submission tables and policies unchanged. Status and preflight evidence: [course content QA](../../docs/qa/DTM_COURSE_CONTENT.md).

`20261114020000_dtm_material_targets.sql` adds nullable material destinations and preserves all existing owner-only material CRUD branches, grants and audit behavior. Omitted destination fields preserve values; explicit null/empty clears. Apply only after the exact-client rollback preflight and deployment plan.

`20261114030000_fee_remission.sql` adds one protected account history table and private retry receipts. Students can read their own history. The authorized administrator can save and delete versioned rows. The migration leaves existing notes in their original table.

`20261114040000_exchange_grant_drafts.sql` adds caller-owned conference drafts and reflections, verified Google identity checks, per-account write serialization, compare-and-set versions and private idempotency receipts.

`20261114050000_tutor_evaluations.sql` stores one immutable response per Google account and questionnaire version. It enforces ten numeric ratings, an exact request envelope, account RLS, and idempotent submission receipts.

`20261114060000_interdisciplinary_programs.sql` stores the public interdisciplinary credit program directory. RLS grants anonymous and authenticated visitors read access. Application roles have no write grants. Every available public document is identified by the verified SHA-256 digest.

`20261114070000_interdisciplinary_registrations.sql` stores owner-only interdisciplinary registrations, withdrawal and completion terms, and exact operation receipts. Student writes require Google identity and use a serialized compare-and-set RPC. The period is derived from the Taipei calendar for local records.

`20261114080000_course_substitutions.sql` stores verified public results for three exact cohort, track and department selections. A recorded empty result is distinct from an uncaptured selection. Application roles have read-only access under RLS.
