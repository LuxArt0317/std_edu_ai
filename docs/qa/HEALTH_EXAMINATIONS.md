# Student health examination inquiry

The [School Affairs inquiry](https://stu.best/school-affairs/services/36-1) follows the verified university screen with two tabs, two help instructions, and five examination columns. The student health card opens the university's separate sign-in. The report action in the university session did not open a report view that could be compared.

Migration `20261115060000_student_health_reports.sql` creates a private examination register and a private PDF bucket. The follow-up migration `20261115061000_student_health_report_downloads.sql` provisions the account-bound download check. The inquiry only reads records for the verified School Affairs account. The campus assistant links to the inquiry and quotes the published contact extension. The chat has no access to the report, student number, or name.

## Record stewardship

An authorized operator provisions each row against a verified Google-linked School Affairs user UUID. Use the Supabase Storage interface or API to attach a PDF at `affairs-health-reports/<user_uuid>/<record_uuid>.pdf`, then mark that row's `report_available` flag true. Use a zero-second cache lifetime when uploading. The bucket enforces the PDF MIME type and a 10 MiB limit. The application verifies the caller owns the published record before issuing a 30-second download link. A link already issued expires on its original schedule. Student accounts cannot access objects directly or mint signed links. Withdraw access by clearing the flag before deleting the file through the Storage API. The inquiry checks both the flag and file existence. Student accounts cannot upload or update attachments. Start with an empty register and load only records approved for the student's stu.best account.

## Verification

- `node tests/integration/health-examinations-db.mjs --deployed` checks SQL boundaries in a rollback-only transaction on the client Supabase project.
- `node tests/integration/health-examinations-ui.mjs` checks the rendered inquiry with synthetic records, errors, sign-in navigation and file responses.
- `node tests/integration/health-examinations-http.mjs` exercises Supabase Auth, Storage, and the API with disposable test accounts. With `EXPECTED_RELEASE_REVISION` set, it tests the pinned production endpoint.
- The controlled case in `tests/evaluation/health-examination-report-boundary.test.mjs` runs the inquiry and chat handlers against one synthetic Storage registry. It checks a true owned availability flag, an unpublished file, a missing file, and other-account and guest denial. The inquiry requests a 30-second capability and opens the synthetic PDF. The chat grades the independent availability question using only its metadata read. This test uses no external Storage, database, authentication or model calls.
- `node tests/integration/health-examinations-http.mjs --assistant-preview` also grades the frozen positive-availability question through the deployed assistant. Set `EXPECTED_RELEASE_REVISION`, `APPROVED_PREVIEW_ORIGIN`, and the authorized Development OIDC environment from an exact clean checkout. The operator reserves two disposable callers, records the owned fixture keys before inserts or uploads, takes paired native inquiry readbacks, and removes the approved test objects and identities under the shared lease. Keep an unfinished journal for reconciliation. The assistant receives only availability metadata. The separate inquiry confirms the private PDF bytes.
- The reference screen is at [STU Student Health Management](https://info.stu.edu.tw/SAO/PEC/trnFiles/rptStuReportByStu.asp).

## Release evidence

Production `31c20e0` is live as Vercel `CrRgSSF79DVRByQ9PrsBpLYDHQCK`. Migrations 20261115060000 and 20261115061000 bring the client to 165 migrations and 198 RLS-protected public tables. The 36-1 inquiry reads account-owned examination rows and issues a 30-second link for a published PDF. Two-account and guest checks, exact fixture cleanup, rollback SQL, pinned browser, guest assistant, deployment shell, client verification and Quality 43566919743 passed. The navigation test covered all 94 catalog destinations, with 27 generic and 27 partial.

ea1e9a0 and 53a7599 each passed the 16-case protected metadata packet. The 6e819f5 Preview separately passed the frozen owned-PDF availability question against a synthetic object in private Storage. The confirmed inquiry opened that object and both callers’ readbacks, hidden and missing report checks, crossed-owner denial and disposal passed. The chat only received availability metadata. Run `node --experimental-strip-types --test tests/evaluation/health-examination-report-boundary.test.mjs` for the controlled verification.
