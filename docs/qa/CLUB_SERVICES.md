# Student club services

The [club system](https://stu.best/school-affairs/services/40-1) has distinct student routes for the monthly activity calendar, borrowing history, and the equipment form. The borrowing list and creation form were inspected under a university student session. The local calendar opens details for published records. The form accepts a verified student identity, a club membership, dates, equipment items, and a purpose. Students can edit or cancel pending requests, and the School Affairs administrator can review requests and mark approved equipment returned.

## Data setup

The migration creates the club catalog, memberships, activities, equipment inventory, closure dates and account-owned requests. An operator provisions these records in Supabase using the approved School Affairs student UUID and the existing student profile. Publish reviewed activity rows, enable available inventory, and record closure dates. Rows begin empty until provisioned. Staff review uses the protected School Affairs owner boundary. Date, eligibility, inventory overlap, status and retry checks run in the database. No university memberships, equipment bookings or private student information were imported.

The student-facing pages follow the university's [club index](https://infosys.stu.edu.tw/StuCorp/), [calendar](https://infosys.stu.edu.tw/StuCorp/CorpActivity/Top), and [borrowing list](https://infosys.stu.edu.tw/StuCorp/ToolBorrow/Index). Staff approval is a local control. The source inventory manager returned to the club index in the available student session. The officer application screens, inventory maintenance and equipment reports still use the university destinations.

## Verification

- `node tests/integration/club-services-db.mjs --deployed` checks eligibility, publication, overlapping reservations, record ownership, admin review and rollback.
- `node tests/integration/club-services-http.mjs` checks authenticated reads/writes and cleanup with disposable accounts. Set `EXPECTED_RELEASE_REVISION` to exercise the deployed API.
- `node tests/integration/club-services-ui.mjs` checks the signed-in UI using synthetic browser fixtures. Set `PUBLIC_SITE_ORIGIN=https://stu.best` with the expected revision to pin production.

## Release evidence

Production `502cf1d` is live as Vercel `3cpEDyT3qRETcoiKgz5wJWW7KbZu`. Migration 20261115070000 brings the client to 166 migrations and 204 RLS-protected public tables. The 40-1 index opens the calendar and separate equipment history and application routes. The database enforces membership, closure dates, inventory conflicts, ownership, retry safety and staff review. Actual-JWT workflow and cleanup, rollback SQL, pinned browser, guest assistant, deployment shell, client verification and Quality 43569869233 passed. All 94 catalog destinations navigated in local QA, with 26 generic and 28 partial.

## Club officer services

Under **社團幹部**, activity applications, club profiles, activity completion, membership and attendance have their own routes. The application form captures the verified date, location, organizer, contact and classification fields. An approved School Affairs manager publishes the activity to the calendar during review. The submitting officer can revise or withdraw a pending request and record completion after the activity ends.

An operator grants officer access by marking an existing `affairs_club_memberships` row as `officer` for the correct club and user. Club profiles and rosters show only records in clubs the current officer manages. Provision contact fields only where the student has approved their use. Attendance list records can be provisioned by an operator in `affairs_club_attendance` against approved or completed applications. Academic period columns display values when provided. The source session showed attachment columns and empty lists. Profile editing, attendance import and member management remain open. The source maintenance roles still need an authorized source view.

- `node tests/integration/club-officer-db.mjs --deployed` checks database permissions, application edits, approval and publication, completion and rollback.
- `node tests/integration/club-officer-http.mjs` verifies the API using disposable authenticated officers. Set `EXPECTED_RELEASE_REVISION` for production.
- `node tests/integration/club-officer-ui.mjs` checks the rendered officer menu, form and roster using test fixtures.

## Release evidence

Production `7a5ab57` is live as Vercel `8JWkVsMbphjiX8EQm8Q8Cne1pfdA`. Migration 20261115080000 brings the client to 167 migrations and 206 RLS-protected public tables. Five verified officer destinations have distinct local routes. Officers can submit, edit, withdraw and complete club applications. Manager approval publishes the calendar record. Club profiles, membership and attendance are filtered by officer membership. Actual-JWT workflow and cleanup, rollback SQL, pinned browser, guest assistant, deployment shell, client verification and Quality 43572010483 passed. All 94 catalog destinations navigated in local QA.

## Activity proposal and closeout attachments

The university application list showed separate proposal and closeout attachment columns. The available session did not expose the upload or post-save details. The local dialog uses those verified columns as its entry points and provides file controls for the stu.best implementation.

The submitting officer may save, replace or remove one PDF per column, with a 2 MiB limit. The proposal is editable while an application awaits review. The closeout file is editable once an approved activity ends, until completion. A reviewer must reload an application if a file changes after the list was opened. Only officers for the application’s club and the School Affairs administrator can read attachment metadata or download a saved version. Files and their revisions are stored together in a private Postgres table behind account-scoped RPC calls. There are no public links. No university student files were imported.

- `node tests/integration/club-documents-db.mjs --deployed` checks permissions, workflow states, exact replay, removal, approval conflicts and rollback.
- `node --import tsx tests/integration/club-officer-http.mjs` exercises both officers and uploads and retrieves a 2 MiB test PDF. Set `EXPECTED_RELEASE_REVISION` to use production.
- `node tests/integration/club-officer-ui.mjs` exercises the attachment dialog, retry, download and removal. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` to pin production.

### Release evidence

Production e98e3f1 is live as Vercel 2X65ZvEwvLoUfN2UcDW9VsLtdsN5. Migration 20261115090000 brings the client to 168 migrations and retains 206 RLS-protected public tables. Proposal and closeout PDFs persist in a private table. The signed-in officer can save, replace or remove each attachment during its workflow window. SQL rollback and approval conflicts, real-JWT 2 MiB upload and download, cross-club isolation and cleanup, pinned browser, guest assistant, deployment shell, client verification and Quality 43574014749 passed. All 94 catalog URLs passed navigation.

## Student menu and new club applications

The university club index lists the club directory, activity notices, activity search, personal activity and club participation records, and new-club applications. The five additional links returned to a CAPTCHA sign-in when opened. The local pages follow the verified menu and reuse the club shell. Their exact university form fields and detail layouts remain unverified.

The directory searches active clubs and the activity lookup searches published activities. Each participation page queries only the signed-in student's membership or attendance rows. A verified School Affairs account with a student profile can propose a club and withdraw a pending application. The protected School Affairs owner can approve or decline. Approval creates the active club and the student's officer membership in one transaction. Case-insensitive duplicate pending names, stale decisions and retries are handled in the database. No university student records or applications were imported.

Authenticated assistant replies use the same read API for private participation and application status. The public assistant provides sign-in links for those questions. The directory and activity search answers link to their respective search pages.

At `/school-affairs/services/40-1/my-attendance`, ask “Show my saved club activity attendance records. Also show my tuition balance.” The assistant checks the saved attendance page and the account’s saved tuition amounts independently. It uses the saved tuition category and the known label format for legacy sample rows. Other charges are omitted from the answer. A failed source is checked once more while the successful section is retained. The final response says which evidence remained unavailable.

`node --experimental-strip-types --test tests/api/club-attendance-assistant.test.ts` runs all five original attendance prompts through the compiled client dispatcher and actual handler with controlled transport. The checks distinguish an empty page from a failed read and cover the separate tuition amount and foreign-owner boundary. This replay does not count toward protected-browser acceptance.

- `node tests/integration/club-student-db.mjs --deployed` verifies literal filtering, paging, publication, caller isolation and the approval/withdrawal workflow in a rolled-back transaction.
- `node --import tsx tests/integration/club-student-http.mjs` checks authentication, private reads, durable retries and withdrawal against the API with disposable accounts. Set `EXPECTED_RELEASE_REVISION` to use production.
- `node tests/integration/club-student-ui.mjs` verifies all six menu links, form retries, review, mobile width and the assistant response using synthetic browser fixtures. Pin production with `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION`.

### Release evidence

Production 076c79a is live as Vercel 4Gi741acYjhLKPYZiw4y9Af4FFNt. Migration 20261115100000 brings the client to 169 migrations with 206 RLS-protected public tables. Five student club destinations add searchable clubs and activities, account-owned participation and memberships, and new-club applications with protected approval. Local and production actual JWT, exact cleanup, pinned browser, five guest assistant links, deployment shell, client verification and Quality 43575984434 passed. All 94 catalog routes passed navigation.

## Assistant read of club equipment requests

From `/school-affairs/services/40-1/equipment`, ask “What is the status of my club equipment request, and when do I return the items?” The signed-in assistant verifies the saved status and scheduled date, then links to the borrowing page. It also supports a recent request, an exact owned request, or a count. The source returns up to 100 requests sorted by their last update, and the answer identifies that limit when the source returns 100. The Student Health equipment entry at `/school-affairs/services/30-2` has its own tracking notes.

Run `node --import tsx --test tests/api/club-equipment-assistant.test.ts` for offline client and handler checks. The fixture verifies bearer-scoped equipment reads, omitted identity and contact data, guest and other-owner boundaries, source failure and retry, and a combined reference to the separately saved tuition balance. The protected Preview operator in [Student assistant evaluation](../../tests/evaluation/README.md#protected-preview-club-equipment-readback) binds those checks to two disposable accounts and verifies cleanup.

## Assistant cancellation of a pending equipment request

Ask “Cancel my club equipment request for "Tripod" on 2026-11-20” or ask to cancel the request already open on its edit page. The assistant asks for a more specific target if the supplied name and pickup date match multiple rows. A proposal shows the saved club, pickup date and an equipment item. Confirming applies that exact request revision through the existing borrowing service. The service verifies ownership and eligibility in a transaction. A lost or invalid receipt leaves the confirmation available under the same request ID.

The handler fixture tests exact bilingual targeting, ambiguity, disallowed states, temporary unavailability and zero writes while composing the proposal. The controlled Chromium test `node tests/integration/assistant-confirmed-action-ui.mjs` exercises both task creation and equipment cancellation. It checks that confirmation is required, an invalid receipt stays withheld, the retry preserves the request ID, and a verified receipt links back to the records. Signed-in acceptance with disposable equipment fixtures remains pending.
