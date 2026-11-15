# Database migrations

## Dated local charge payments

`20261116000000_charge_payment_history.sql` adds an append-only ledger for explicitly recorded payments and full reversals. It seeds no entries and supplies no dates for existing paid totals. The first dated entry captures the charge’s previous cumulative paid amount as its undated baseline. The current charge total equals that baseline plus payments minus reversals.

- `affairs_change_charge_payment(p_kind text,p_payload jsonb)` requires verified administrator access. `record_charge_payment` takes exactly `request_id`, `student_id`, `charge_id`, `paid_on`, `amount` and `currency`. Supply `amount` as a positive decimal string with at most two decimal places and `currency` as `TWD`. `reverse_charge_payment` takes exactly `request_id`, `student_id`, `charge_id`, `paid_on` and `payment_id`. Dates are explicit Taipei business dates in `YYYY-MM-DD`, up to today. A full reversal date cannot precede the original entry. The receipt returns `id`, `chargeId`, `studentId`, `entryKind`, `paidOn`, `amount`, `currency`, `sourceMode`, `reversesPaymentId`, `amountPaid` and `legacyAmountPaid`. Money is serialized as decimal strings. Replay needs the same request ID, action and payload.
- `affairs_read_charge_payment_history(p_from date,p_through date,p_charge_id uuid,p_offset integer,p_limit integer)` reads the verified caller’s rows. Either date and the charge selector may be null. Date bounds are inclusive. Choose a limit from 1 to 100 and an offset from 0 to 5,000. The response contains `userId`, `studentRecordFound`, `rows`, `total` and `hasUndatedPaidAmount`. Rows contain `id`, `chargeId`, the current `chargeLabel` and nullable `chargeCategory`, `entryKind`, `paidOn`, `amount`, `currency`, `sourceMode` and `reversesPaymentId`. A partial page does not support a complete monthly total. The undated flag applies to the selected charge scope independently of the date filter.
- The write RPC serializes against the existing charge row and commits its ledger entry, total, audit and replay receipt together. The existing manager can edit unrelated charge fields, while a charge with entries keeps its baseline, ledger-linked paid amount and deletion protection. A reversal corrects the local record. This ledger provides no transfer, refund or bank-settlement confirmation.

`20261116010000_charge_payment_history_admin.sql` adds `affairs_read_charge_payment_history_admin(p_student_id uuid,p_charge_id uuid,p_from date,p_through date,p_offset integer,p_limit integer)`. The existing verified School Affairs administrator role is required. The student and charge IDs must match a single charge. Rows include `canReverse`, evaluated against every reversal of the payment, including reversals outside the selected date or page. The write RPC rechecks the selected payment under the charge lock. The SQL regression in `tests/evaluation/charge-payment-history-admin.sql` uses an empty, socket-only local PostgreSQL database named `charge_payment_admin_disposable` and rolls back its fixtures.


`20261115230000_assistant_conversation_delete_receipts.sql` adds versioned conversation read, save and delete RPCs. The protected protocol serializes writes by account, bounds the number of private deletion markers, and closes the creation window for expired time-stamped IDs even if the database clock moves backward. Preflight must establish that the migration is pending and the existing table contains zero valid UUIDv7 IDs before the new policies hide that ID family from legacy direct reads. The migration must precede the v2 runtime. It keeps the currently deployed v4 direct read and delete behavior during coexistence. Removing legacy direct deletion and preventing fresh legacy inserts require a separate cutover after old runtimes have drained. Never edit an applied migration.

`20261115110100_elearning_page_metadata.sql` adds a read-only, Google-session-gated RPC for the saved Digital Academy category tree and exact notices. It exposes a bounded projection of the published catalog and notice fields.

`20261114150000_graduation_clearance.sql` adds term periods, account assignments, applications, office review rows and private replay receipts. It seeds no student records or dates.

`20261114140000_teaching_feedback.sql` adds survey windows, separated completion and response storage, and immediate feedback with review status. Access is limited to the verified student or administrator RPC scope.

`20261114130000_early_graduation.sql` adds administrator-managed term windows and eligibility, account-owned applications, and private retry receipts. It seeds no student records or dates.

`20261114120000_credit_transfer.sql` adds account-owned applications, administrator review and private retry receipts. It seeds no applications and does not change transcript records.

`20261114110000_course_withdrawal.sql` adds the administrator-managed withdrawal window and account-scoped read and change functions over existing withdrawal-phase records. Private receipts make retries safe.

`20261114100000_course_adjustment.sql` adds public late-add notice content, private term- and phase-scoped eligibility, and a versioned administrator RPC with durable retry receipts.

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

Migration 20261114210000 adds the protected student information baseline and private versioned confirmation receipts. The migration seeds no records.

Migration 20261114220000 adds caller-owned announcement email preferences and a private queue with versioned opt-in and fenced delivery.

Migration 20261114230000 installs the observed initial certificate catalog, protected applications, masked payout references, and reservation-based proof Storage.
