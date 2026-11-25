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

## Verified School Affairs assistant reads

Issue [#100](https://github.com/LuxArt0317/std_edu_ai/issues/100). The signed-in chat now sends saved venue requests to the same verification endpoint used for other owned records. The request uses the caller's School Affairs JWT and selects only the request identifiers, room, booked date and period, local status, and submission time used for ordering. The assistant never selects the purpose or review note, opens the administrative view, or checks the public schedule to answer a personal status question.

A question can narrow the lookup by exact request ID, room code, period, status, or date. It can also request only a count or the newest matching submission. The record reader checks ownership, scope, ordering, and exact pagination before showing a reply or table. LangGraph retries a failed read with the same signed-in account and filters. For venue-only questions, a second temporary service error can trigger a third read within the deadline. If verification fails, the answer names the unavailable records and links to their page. The verified empty result applies only to matching saved stu.best requests. Guests can sign in and return to the venue requests page. Personal request metadata and public availability are separate queries.

Run `node --test tests/api/venue-request-assistant.test.ts` with Node 24. The suite runs the real handlers and LangGraph with injected PostgREST responses, including wrong-owner and out-of-scope rows, a third-read recovery, persistent failure, incomplete results, guest and compiled browser dispatch. No hosted I/O or production acceptance is represented by these tests.

### Protected Preview ownership replay

```sh
node tests/evaluation/run-venue-protected-preview.mjs --preflight
node tests/evaluation/run-venue-protected-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Use a clean checkout at the exact protected Preview revision, the configured client fixture environment, and a Development `VERCEL_OIDC_TOKEN`. The seven requests cover two separately owned pending records, a filtered count, an exact crossed ID with no owned match, and guest, foreign-account, and unsupported-companion boundaries.

The disposable accounts each own a pending request in a fictional room dated in 2001. This keeps the fixtures outside reservable dates. Setup rejects any published schedule for those codes, existing reserved row, request receipt, or audit data. The paired native API and direct row-level checks run before and after every request. Both accounts are denied the management view. The signed response receipt binds the Preview release, caller, question, native read, projected evidence and terminal reply. The final report verifies exact removal of both fixture rows and identities and preservation of the protected owner.

The four original approved-record and fee-companion cases retain the T0308 and tuition oracles for scratch PostgreSQL verification. An approved row on the shared project would affect public capacity. The two outage cases use the controlled handler tests, and the three generic-note legacy cases still need their own rebind. The operator preflight lists these gaps without contacting the Preview or database.

The distinct `--client-dispatch venue-requests` browser packet passed record, empty and foreign questions on protected `1db8d43`. Each turn was graded against its signed response receipt and separate account checks. All three answers restored in a fresh browser context and all fixtures were removed. The combined fee question and hosted outage remain outside this packet. [Protected Preview](https://stdedu-2cfig8i4z-v1-d286.vercel.app/campus-assistant)
