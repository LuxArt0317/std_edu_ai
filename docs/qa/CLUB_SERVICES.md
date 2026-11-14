# Student club services

The [club system](https://stu.best/school-affairs/services/40-1) has distinct student routes for the monthly activity calendar, borrowing history, and the equipment form. The borrowing list and creation form were inspected under a university student session. The local calendar opens details for published records. The form accepts a verified student identity, a club membership, dates, equipment items, and a purpose. Students can edit or cancel pending requests, and the School Affairs administrator can review requests and mark approved equipment returned.

## Data setup

The migration creates the club catalog, memberships, activities, equipment inventory, closure dates and account-owned requests. An operator provisions these records in Supabase using the approved School Affairs student UUID and the existing student profile. Publish reviewed activity rows, enable available inventory, and record closure dates. Rows begin empty until provisioned. Staff review uses the protected School Affairs owner boundary. Date, eligibility, inventory overlap, status and retry checks run in the database. No university memberships, equipment bookings or private student information were imported.

The student-facing pages follow the university's [club index](https://infosys.stu.edu.tw/StuCorp/), [calendar](https://infosys.stu.edu.tw/StuCorp/CorpActivity/Top), and [borrowing list](https://infosys.stu.edu.tw/StuCorp/ToolBorrow/Index). Staff approval is a local control. The source inventory manager returned to the club index in the available student session. The officer application screens, inventory maintenance and equipment reports still use the university destinations.

## Verification

- `node tests/integration/club-services-db.mjs --deployed` checks eligibility, publication, overlapping reservations, record ownership, admin review and rollback.
- `node tests/integration/club-services-http.mjs` checks authenticated reads/writes and cleanup with disposable accounts. Set `EXPECTED_RELEASE_REVISION` to exercise the deployed API.
- `node tests/integration/club-services-ui.mjs` checks the signed-in UI using synthetic browser fixtures. Set `PUBLIC_SITE_ORIGIN=https://stu.best` with the expected revision to pin production.
