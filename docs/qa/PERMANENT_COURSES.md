# Permanent course catalog

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [Catalog](https://stu.best/school-affairs/services/12-2) · [University public catalog](https://infosys.stu.edu.tw/WebStuCourse/ForCourse)

The public university search returns an initial 50 rows and a filtered catalog. The captured course options cover 40 distinct kinds across three divisions, with 15,580 distinct course codes. Supabase stores the default order, group order and filter options. The public catalog API exposes reads only. A course code opens a printable description. The server resolves an uncached description in the same university request session, saves the parsed fields and returns the stored result. It never saves the upstream cookies or identifiers. The campus assistant uses the same stored catalog and links to the exact course.

The page retains the observed filter and dialog layout with 50 results per page. Links cover implemented local destinations. University staff maintenance and the authenticated teacher timetable require separate inspection. A permanent course entry gives no enrollment or current offering information.

The initial public snapshot was captured at 2026-11-14 00:08:40 UTC, SHA-256 `7b1e61357443229807af3a3bb942e789e97f4b6758a673eacad954ec57f82832`. The exact-target preflight verified 15,580 distinct rows and 50 initial results, then rolled back. The separate applied import preserved those counts. Production database verification confirmed 150 migrations and 176 RLS-protected public tables. The uncached IMU00101 detail was saved, then read again with source access disabled in the test. Six catalog HTTP responses and two assistant routes passed against the local handler connected to the client database.

## Refresh and verification

- `node scripts/capture-permanent-courses.mjs /tmp/stu-permanent-courses.json` reads the public catalog and captures all filter combinations. It fetches five initial descriptions. Remaining descriptions are cached when requested.
- `node scripts/import-permanent-courses.mjs /tmp/stu-permanent-courses.json --rollback` verifies the import, row counts and visitor policy without leaving changes. The script also supports an initial migration preflight when the tables are absent.
- `node scripts/import-permanent-courses.mjs /tmp/stu-permanent-courses.json --apply` applies a complete, newer capture atomically in the exact client database. Existing descriptions are preserved for retained course codes.
- `node tests/integration/permanent-courses-ui.mjs` checks the direct menu destination, filter, pagination, printing, keyboard dismissal, narrow layout and sign-in return against the catalog API. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` for the deployed bundle.

## Deployed evidence

Production `3665b12` is live as Vercel `2BRvLpYQSkpokYgEUgEBQAn2BYwN`. Only migration 20261114160000 was applied, bringing the client to 150 migrations and 176 RLS-protected public tables. The import has 15,580 course records across 120 groups. The pinned browser, public catalog and bilingual assistant HTTP checks, persisted on-demand description and eight public shell routes passed. Quality 43534205868 passed. The local audit reached all 94 destinations and reports 38 generic and 17 partial entries.

Run `EXPECTED_RELEASE_REVISION=3665b1207bd78dec081b8c5f7a4d295248e3876e node tests/integration/permanent-courses-http.mjs` to replay the public API and assistant checks. The first local unit run had one assistant-conversation timing failure. The complete rerun passed all 541 unit tests. The initial browser run revealed dialog positioning and sign-in query loss. Both were corrected and the focused and navigation suites passed.
