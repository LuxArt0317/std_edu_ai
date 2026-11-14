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

An operator grants officer access by marking an existing `affairs_club_memberships` row as `officer` for the correct club and user. Club profiles and rosters show only records in clubs the current officer manages. Provision contact fields only where the student has approved their use. Attendance list records can be provisioned by an operator in `affairs_club_attendance` against approved or completed applications. Academic period columns display values when provided. The source session showed attachment columns and empty lists. Proposal/closeout uploads, profile editing, attendance import and member management remain unverified or unimplemented. The source maintenance roles still need an authorized source view.

- `node tests/integration/club-officer-db.mjs --deployed` checks database permissions, application edits, approval and publication, completion and rollback.
- `node tests/integration/club-officer-http.mjs` verifies the API using disposable authenticated officers. Set `EXPECTED_RELEASE_REVISION` for production.
- `node tests/integration/club-officer-ui.mjs` checks the rendered officer menu, form and roster using test fixtures.

## Release evidence

Production `7a5ab57` is live as Vercel `8JWkVsMbphjiX8EQm8Q8Cne1pfdA`. Migration 20261115080000 brings the client to 167 migrations and 206 RLS-protected public tables. Five verified officer destinations have distinct local routes. Officers can submit, edit, withdraw and complete club applications. Manager approval publishes the calendar record. Club profiles, membership and attendance are filtered by officer membership. Actual-JWT workflow and cleanup, rollback SQL, pinned browser, guest assistant, deployment shell, client verification and Quality 43572010483 passed. All 94 catalog destinations navigated in local QA.
