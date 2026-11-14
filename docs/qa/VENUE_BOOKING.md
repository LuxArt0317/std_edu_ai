# Venue booking and schedules

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [Application](https://stu.best/school-affairs/services/44-1) · [Weekly schedule](https://stu.best/school-affairs/services/47-1) · [University public schedule](https://info.stu.edu.tw/SWD/placeborrow/qryClassroomAtLoginPage.asp)

The university's public query provides venue lookup and 15 periods across seven days. The local lookup checks the returned venue, exact dates, period order and all 105 cells. It saves only venue metadata and occupied slot IDs. Names and other booking text are excluded. A stored schedule is refreshed after 15 minutes. After 30 minutes it is display-only and cannot authorize an application or approval.

A signed-in user can confirm a local request and see or cancel their own requests. The site administrator reviews submitted requests. The database rechecks the selected period and serializes changes to each slot. It permits only one local approval per slot and records each operation receipt with the caller and request ID. Public schedule responses contain only occupied slot IDs, including approved local slots. Private purposes and notes never appear in public results or assistant replies.

The campus assistant links a room and week when supplied and reads saved request statuses for the signed-in caller. A blank period means no occupancy was displayed in the captured schedule. An approved stu.best request records the local decision. University submission and approval require the university process. The authenticated university application and query layouts remain unobserved.

## Verification

- `node tests/integration/venue-booking-db.mjs --rollback-preflight` tests the exact migration against the client database and rolls back all test writes. Use `--deployed` for the installed migration.
- `node tests/integration/venue-booking-ui.mjs` checks both menu routes, the live public schedule, confirmation, repeat requests, administrator review, cancellation, mobile and the sign-in return. The browser uses fixtures for private reads and writes. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` for a deployed check.

## Deployed evidence

Production `52e47ea` is live as Vercel `EBvMNxV4o1VgDcgkdbF8pDErgvsG`. Only migration 20261114170000 was applied. The client has 151 migrations and 178 RLS-protected public tables. The revision-pinned browser, 19 authenticated HTTP requests with exact cleanup, three guest assistant replies, and eight public shell routes passed. Quality 43536795319 passed. All 94 local links passed the navigation inventory, which reports 36 generic and 18 partial destinations.

The authorization and competing-approval test rolled back all data changes. The deployed browser used live public schedules and fixtures for private actions. The separate HTTP suite used real Supabase JWTs and removed its accounts, requests, receipts and isolated schedule. Public schedule measurements matched the 962px frame and the 105-cell grid. The protected form remains unobserved.
