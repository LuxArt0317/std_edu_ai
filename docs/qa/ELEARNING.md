# Remote-learning Moodle

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · School Affairs external menu entry 4-2

The university's Digital Academy uses a different Moodle installation from DTM. Read-only inspection observed the signed-out screen, authenticated three-column homepage, category hierarchy, 20 course listings in Academic Affairs (41), the TronClass migration announcement, and the no-key enrollment form for workshop 9718. No university enrollment was submitted. The captured directory contains 34 category labels and 20 announcement links. Category counts reflect the observed listing; uncaptured course entries are not inferred.

The local workspace uses the existing School Affairs Google session. The archive is stored in Supabase. A student may join workshop 9718 in stu.best and see it again under My courses. The student writes their own enrollment through a caller-bound RPC. Repeated or concurrent saves keep a single record and return the same receipt. The campus assistant can list those records with links. Uncaptured materials, grades and assignment data remain unavailable; the existing DTM records are a separate dataset.

The login uses Google for stu.best and directs institutional credential sign-in to the university. The signed-in layout follows the observed Anomaly theme. Notice and course links lead to local detail pages. The migration notice has a verified local summary; the other detail pages link to the source rather than inventing protected contents.

## Verification

```sh
node tests/integration/elearning-db.mjs --rollback-preflight
npm run db:plan -- --only=20261115010000
node --experimental-strip-types tests/integration/elearning-http.mjs --verify-client
PUBLIC_SITE_ORIGIN=http://127.0.0.1:54632 node tests/integration/elearning-ui.mjs
node --experimental-strip-types --test tests/api/elearning.test.ts
```

The SQL preflight runs in a rolled-back transaction against the exact client database. The browser suite uses synthetic Google and API responses. The HTTP suite tests the real database with disposable Google-linked identities and removes their exact records.

Rollback, exact migration planning, migration application, and actual JWT validation passed. The client has 159 migrations and 192 RLS-enabled public tables.

[Source portal](https://elearning.stu.edu.tw/) · [University migration notice](https://elearning.stu.edu.tw/mod/page/view.php?id=325504)

## Production evidence

Production `4ead21c` is live as Vercel `EAkihex4TWsCPQK1U4qpE6jYDbDt`. Migration 20261115010000 brings the client to 159 migrations and 192 RLS-protected public tables. Rollback and actual-JWT enrollment, concurrent replay, isolation and exact fixture cleanup passed locally and on production. The pinned browser, guest assistant, live shell and Quality 43555452936 passed. The 94-destination audit reports 29 generic and 25 partial entries. The archive covers 34 categories, 20 Academic Affairs courses, 20 notice entries and one local workshop enrollment. Uncaptured course resources and official grades, assignments and enrollments remain outside the verified dataset.


## Catalog expansion

The signed-in source selector exposed 43 categories. Read-only capture followed 191 listing screens through their final visible page and recovered 3,291 unique course IDs and titles. The largest category held 907 courses across 46 pages. The expansion updates the catalog in place and preserves existing workshop enrollment and course IDs. Course list and search endpoints return 20 rows per page; the home and personal assistant stay bounded. The source portal determines access to materials and academic records.

Validate against the exact client database with `node tests/integration/elearning-db.mjs --catalog-preflight` before applying migration `20261115020000`, or `--catalog-deployed` afterward. The HTTP suite now checks filtering, pagination, empty categories and preserved private enrollment. Browser checks drive category pagination, refresh, search, course detail and the signed-in assistant.

[University course directory](https://elearning.stu.edu.tw/course/index.php?categoryid=18)
