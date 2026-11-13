# Moodle URL resources — Issue #98

## Source and scope

The authenticated URL-resource page captured on November 13, 2026 shows a material title and `點選 [destination URL] 來開啟資源。` inside the normal white course pane, with the existing navigation blocks on the left. Private evidence is ignored under `artifacts/visual-parity/dtm-url-resource/source-1533.jpg` and `geometry.json`. At the captured 1533px viewport, the source pane starts at x402.828125/y166, measures 1110.171875×103px, and uses a 28px/40px title and 14px/20px resource line. These are reference measurements, not a completed pixel-parity claim.

The local route is `/dtm/course/:course/material/:material`. The student pane contains the title and the stored destination link; it does not add a summary card or editing controls. No private source titles, destination values or account data are imported or seeded. This batch does not synchronize Moodle resources or fetch remote material content.

## Data and navigation

`target_url` is the explicit destination. `source_url` remains the Moodle provenance link; summaries and provenance are never used to infer a destination. The optional material-editor field uses the shared URL validator. Accepted destinations are literal ASCII HTTPS URLs up to 2048 characters, subject to its hostname/port/encoding rules. The application does not resolve DNS or verify the destination's availability. Null or an explicit empty string clears the saved destination. An omitted target field in an older material edit is preserved when its input remains blank.

`GET /api/affairs-data?scope=dtm-course-resource&course_id=…&material_id=…` returns an exact owned course and its material, independently of the general workspace page. An owned missing material is a successful `material:null`; an inaccessible course, invalid response or failed request remains unavailable. A material with no target shows `Resource link unavailable.` No fallback link, iframe, automatic navigation or resource download is created. A valid link uses `target="_blank" rel="noopener noreferrer"`.

`useDtmCourseResource` clears old data immediately on caller, course, material, client or refresh changes and aborts prior requests. Its transport validates the session before and after the request, uses a 30-second total deadline and a 196608-byte UTF-8 response limit, and rejects foreign or malformed data.

`useDtmCourseHeader` supplies the independently verified course header when a parent-course or assignment route is missing from the general snapshot. It validates only the existing course-content reader's first page and returns no activity inventory or management rights. The complete content renderer retains its own consistent paging. Header state is not owned by that child renderer, so navigating between a resource, its parent course and an assignment does not rely on the content component staying mounted. Compiled route integration and rendered navigation passed the local checks below.

Material edit/delete access remains under the course menu's `Manage materials` dialog. Grade details and personal grade editing remain separate. Material saves/deletes bind to the initiating caller, abort when that account's editor is removed, suppress duplicate dispatch and ignore late completion. Failed saves retain fields and the existing record ID for retry.

## Verification

The focused client, resource hook/pane, material editor and header suites contain **22 new passing cases**. They cover exact request scope; session/account changes; byte, UTF-8, JSON and deadline failures; missing/unsafe destinations; native navigation; explicit clear versus omitted target; failed-save retry; delete retry; stale completions; grade-modal preservation; and first-page header scope. The six existing course-content and seventeen dashboard cases also passed. The former callback-based header implementation and its two tests were removed in favor of the independent header hook; the content renderer is restored unchanged.

Run the scoped offline checks from the client checkout:

```sh
node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test \
  tests/unit/dtm-course-resource-client.test.ts \
  tests/unit/dtm-course-resource.test.tsx \
  tests/unit/dtm-material-resource-editor.test.tsx \
  tests/unit/dtm-course-header.test.tsx \
  tests/unit/dtm-course-content.test.tsx \
  tests/unit/dtm-dashboard.test.tsx
```

Expected result: **45 passed, zero failed**. Strict focused TypeScript passed. Scoped lint retains the existing grade-hash effect warning in `DtmStudentRecords.tsx`; no new warning was introduced by the resource code.

The isolated candidate passed 999 API/source checks and 541 unit cases, TypeScript and API compilation, production build/assets, lint with existing warnings, 104-document handoff validation, and a zero-findings dependency audit. The first unit run failed three existing grade-context cases because the fallback header reader was enabled too broadly; narrowing it to missing parent materials or exact assignment routes fixed those failures. The final full suite passed.

The compiled local browser suite passed six groups and four viewport screenshots at 1533, 768, 390 and 320 pixels. Native keyboard navigation, Back/reload, exact records omitted from the generic snapshot, failed-snapshot recovery, destination safety, account changes and cancelled existing controls passed. Source pane x/width differs by at most 0.016 CSS pixels and vertical measurements by at most 1 pixel; there is no horizontal overflow. It made 76 mocked API reads and zero live API/auth/model calls or mutations. Evidence: `artifacts/dtm-course-resource-ui/2026-11-13T13-31-40.621Z/result.json`. The first failed run at `13-30-33.813Z` is preserved: its selector expected an inline editor to be a dialog; only the test selector changed.

Two rollback-only database preflights stopped at overly strict test expectations: SELECT-only RLS may suppress a direct write or anonymous read with zero rows instead of throwing a permission error. Both raw failures are retained (`e0db20fe` and `48df47df`), and both verified complete transaction rollback, original schema/history/owner/fixture restoration and a closed connection. Runtime permissions were not relaxed to satisfy the tests. The corrected checks accept only permission denial or zero rows, then verify original material and audit state.

Corrected rollback-only preflight `201c3b12` passed four groups and 17 successful commands in 99.524 seconds, with exact cleanup and connection closure. The exact client plan then selected only `20261114020000_dtm_material_targets.sql`; it was applied successfully, bringing migration history to 136 with the same 152 public tables. Actual-JWT local acceptance `82aa7fd5` passed five groups, 62 application requests and 15 successful writes. Exact synthetic fixture cleanup, owner/unrelated-record preservation and connection closure passed. It invokes the actual handlers with real fixture JWTs; it does not test a remote deployment. Deployed actual-JWT acceptance `3b8ead29` passed the same five groups, 62 HTTP requests and 15 successful writes against pinned runtime `7476b4e5b6d7a81d95e3c9a47af5e16ad54aef63`. Exact fixture cleanup, protected-owner/unrelated-record preservation and closed connection passed. Production browser run `2026-11-13T13-48-22.922Z` passed six groups/four screenshots/75 mocked API reads, with no unexpected requests, page errors or real auth/model/mutation calls. It verified the manifest and compiled entry before and after. Vercel Ready `DaqqwC12pEUNjxKFg7dpr5K1u2Mb`, public manifest built2026-11-13T13:44:26.588Z and entry `index-NK0ZdXWn.js` match. Eight public routes/50assets and two provider-free startup checks passed. Quality43435922591 attempt2 succeeded unchanged; attempt1 retained a failure in the pre-existing15ms supplemental-reader timing assertion, outside this batch. Synthetic fixtures do not establish official Moodle synchronization, complete source parity or external destination availability.
