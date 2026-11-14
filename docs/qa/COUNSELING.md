# Counseling appointments

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · School Affairs service 29-1

The signed-in menu opens a standalone counseling overview. The university's entry and consent layout were observed at 1280 px. The source form beyond consent was outside the approved inspection. The local data-use notice identifies who can see appointment preferences and links to the university service separately. Existing private notes remain reachable at the service's `/notes` route.

The client database records an appointment type, preferred Taipei date and period, consent version and timestamp, state, and confirmed time. Students can read their records and cancel their open request. An explicitly granted coordinator can see the contact email and schedule or close the request. The protected owner manages grants; the owner's admin role alone cannot read the queue. No coordinator is assigned by default. No counseling notes, uploaded documents, assessment results, or official appointments are copied. Chat links to the entry or private history without reading the records.

## Verification

```sh
node tests/integration/counseling-db.mjs --rollback-preflight
npm run db:plan -- --only=20261115000000
node tests/integration/counseling-db.mjs --deployed
node --experimental-strip-types tests/integration/counseling-http.mjs --verify-client
PUBLIC_SITE_ORIGIN=http://127.0.0.1:54631 node tests/integration/counseling-ui.mjs
node --experimental-strip-types --test tests/api/counseling-assistant.test.ts
```

Use rollback mode against the client before applying the migration and deployed mode after it is applied. The authenticated HTTP suite requires an unused counseling queue and creates disposable Google-linked accounts to test the local handlers against the exact client database. With an expected release revision, the HTTP suite verifies live authorization and disabled booking without granting a temporary coordinator. The browser suite isolates Google and API requests with fixtures. Production should keep booking unavailable until the owner identifies and grants an actual coordinator.

Rollback preflight passed, preserving the protected owner and schema. The exact client plan selected only migration 20261115000000. It was applied to the client database, bringing it to 158 migrations and 188 public tables with RLS. Authenticated local-handler tests passed with exact fixture cleanup. The separate 94-destination audit passed navigation and reports 30 generic and 24 partial entries.

[Source counseling entry](https://info.stu.edu.tw/sao/Interview/index.asp)
