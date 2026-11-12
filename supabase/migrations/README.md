# Database migrations

Files run in timestamp order through the root `db:plan` and `db:deploy` commands. Each pending migration is applied in a transaction and recorded in `supabase_migrations.schema_migrations`. Do not edit an applied migration or reset the client database. `20261106010000_affairs_academic_records.sql` adds site-owned sample school records and an audited, owner-only manager RPC. `20261106020000_affairs_manager_hardening.sql` keeps that manager within sample students, sections and enrollments if verified records are imported later. Neither migration imports university SIS or Moodle data.

Migration `20261112010000_student_workspace.sql` adds account-owned meetings, grades and service records, with RLS, same-course assignment links and audited writes. A shared request summary is created only when the owner asks for stu.best review.

Migration `20261112020000_leave_application_fields.sql` adds the remaining observed leave categories, contact phone and the mental health leave time period. The account-only service-record RPC validates and stores these fields. Staff review receives a summary with dates and class periods.

`20261112030000_scholarship_applications.sql` adds RLS-protected local demonstration periods and account applications, with private idempotency receipts and audited RPC-only writes. Period publishing/review requires the verified site administrator. Student edits require an open window and an unreviewed application. Actor/period/application locks and version checks serialize competing actions. There is no automatic period or award seed.
