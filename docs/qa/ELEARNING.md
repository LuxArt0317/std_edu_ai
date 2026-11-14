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

## Course outlines

Migration `20261115030000` stores three sections and 17 activity records from two verified course views. The outline RPC checks the signed-in Google identity and accepts a course ID. Rows require a matching course-access grant, a saved enrollment, or an existing School Affairs administrator role. Course-access grants are managed through trusted database operations. The migration creates no production grants. The assistant looks up the course shown on screen and links to activities available to that account. Official Moodle still controls access to each activity and its contents.

Use `node tests/integration/elearning-db.mjs --outline-preflight` to run rollback-only SQL checks, or `--outline-deployed` after applying the migration. The existing HTTP and browser suites also verify the outline and account isolation.

The authorized outline uses the course title in the page header, category breadcrumbs, bordered sections and the original Moodle link and attendance icons. The source images are the public Anomaly theme assets. [Link icon](https://elearning.stu.edu.tw/theme/image.php/anomaly/url/1663146069/icon) · [Attendance icon](https://elearning.stu.edu.tw/theme/image.php/anomaly/attendanceregister/1663146069/icon)

[Safety training course](https://elearning.stu.edu.tw/course/view.php?id=9408) · [Retirement fund course](https://elearning.stu.edu.tw/course/view.php?id=9098)

## Activity pages

Open a saved activity at `/elearning/course/:courseId/activity/:activityId`. The page resolves the activity only from the authenticated result for that course. Both an unknown activity and a mismatched course hide the destination. Local links preserve the breadcrumb and the exact post-sign-in destination. The panel opens the institutional Moodle resource on explicit click and uses the same data as the assistant. No Drive share URLs, videos, slides, submissions or attendance results are imported.

Migration `20261115040000` adds an activity purpose for the 17 verified records. Outline requests and the assistant distinguish videos, slides, feedback and attendance links. The browser suite covers course-to-activity navigation, reload, guest sign-in return and denied access. Run the rollback checks with `node tests/integration/elearning-db.mjs --activity-preflight` or use `--activity-deployed` against the installed migration.

[Moodle URL resources](https://docs.moodle.org/501/en/URL_resource)

Production `d4f9cfa` is live as Vercel `GY1xXgz6xpFruqB4xiTjeTtYY65s`. Migration 20261115030000 brings the client to 161 migrations and 195 RLS-protected public tables. Three sections and 17 verified activity links are available across two course outlines. Rollback and actual-JWT verification covered course-level access, non-Google denial, account isolation and exact cleanup. The pinned browser verified the course page and signed-in assistant links. Guest assistant, shell and Quality 43558768540 passed. Moodle controls access to the linked activity content. The migration creates no production access grants. Official grades, assignment submissions, enrollment and attendance results remain outside this import.

Production `357959c` is live as Vercel `EPrgdRGAxJhX42teSiU6EopZ4X83`. Migration 20261115020000 brings the client to 160 migrations and 192 RLS-protected public tables. The 43-category catalog contains 3,291 verified course listings. Exact-client rollback, deployed SQL and actual-JWT tests passed, including page 46 of category 28, filter validation, concurrent enrollment, existing enrollments and exact cleanup. The pinned browser, live shell, and Quality 43557177924 passed. All 94 School Affairs destinations passed the navigation audit. The captured scope covers the listings visible to the current university session. Course materials, official grades and university enrollment records remain separate. Two source course outlines were observed read-only for later resource work.

Production `4acef46` is live as Vercel `HSEtphCQGR3ngn5RQqoqp4SpELyi`. The outline layout uses the verified course header, category breadcrumbs, original Moodle icons and measured section spacing. The pinned browser and actual-JWT verification passed. All 94 School Affairs destinations passed navigation, with 29 generic and 25 partial. Quality 43559400070 passed. No migration was required. Fourteen linked slide/video screens display Google Drive previews and one feedback screen displays a Google Form. Only the screen and destination types were verified. The source attendance report denied access in the current session. The teacher timetable source still requires its own CAPTCHA sign-in.
