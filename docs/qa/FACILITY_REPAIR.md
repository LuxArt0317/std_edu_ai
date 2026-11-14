# Facilities repair

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [Report a repair](https://stu.best/school-affairs/services/45-1) · [Repair history](https://stu.best/school-affairs/services/45-1/history)

The university's public noticeboard shows when repairs were reported, their location, the affected item, and the outcome. The existing signed-in browser opened the university's area picker, building and outdoor forms, equipment picker, and empty progress table. The local pages follow those layouts and use the 18 observed area codes and 110 equipment codes stored in Supabase. Site administrator dispatch and populated university history remain unobserved. The stu.best workflow uses its own report records, and no cases were imported from the noticeboard. [University repair directory](https://info.stu.edu.tw/swd/all/Rpg/indexDirectory.asp) · [Noticeboard](https://info.stu.edu.tw/swd/all/Rpg/indexContent.asp)

A signed-in user confirms a report and can see its status and recent events. They can cancel a submitted report until work starts. The site administrator can start work, record completion, or reopen a completed report. Administrator notes are visible to the report owner. The assistant can link to the form and read the signed-in caller's report numbers, dates and statuses. Its activity records the lookup. Full descriptions and notes stay in the report view.

Migration `20261114180000` enables row-level security on reports and events. Direct table access is revoked. The RPCs use the verified Google-linked caller and the existing School Affairs administrator check. A caller-specific request ID returns the original receipt on retry. The report version protects status updates against stale writes. Migration `20261114190000` adds the catalogs and separate contact, room, floor, bed and equipment fields. Older reports remain readable.

## Verification

- `node tests/integration/facility-repair-db.mjs --rollback-preflight` tests the migration in a transaction before installation. Use `--catalog-preflight` for the second migration or `--deployed` for installed functions. All modes roll back test writes.
- `node tests/integration/facility-repair-ui.mjs` tests the distinct menu destination, confirmation, Escape, duplicate prevention on retry, private history, administrator review, assistant activity and mobile layout with browser fixtures. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` to check production.
- `node --experimental-strip-types tests/integration/facility-repair-http.mjs --verify-client` checks the real client database with two disposable, separately authenticated callers and verifies their cleanup. Set `EXPECTED_RELEASE_REVISION` to test production HTTP handlers.
