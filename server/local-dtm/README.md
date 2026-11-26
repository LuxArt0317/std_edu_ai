# Local Moodle library

Owner-scoped SQLite storage for user-authorized DTM captures. Tables retain courses, pages, activities, literal grade rows and import batches. No authentication cookies, source session keys or university passwords are saved. Imports upsert transactionally and do not erase uncaptured pages. Source URLs are restricted; source content is rendered as text, not executable HTML.

Set `LOCAL_DTM_DATABASE` to an absolute private file path and `LOCAL_DTM_IMPORT_EMAIL` to the authorized importing Google account in the ignored local environment. Open `/dtm/import` while signed in; paste the capture JSON and import. Only the loopback development server exposes the import route, requires a same-origin POST and validates the Google bearer session. Hosted environments disable the library and cannot import. Back up the private database separately; it is not a Git asset.

`GET /api/affairs-data?scope=dtm-library` lists the caller's courses and coverage. Add `course_id`, `page_key` or `q` to read source pages. This is the same authenticated API available to the assistant. All SQL selections bind the verified caller ID; another user's rows are never returned. Missing captures remain unavailable. No enrollment, final-grade calculation, submission or download is inferred from activity listings.

## Assistant grade reads (Issue #111)

Normal library reads exclude the capture queue; only `view=coverage` returns pending import links. `view=grades` returns the compact course catalog with literal total, range, percentage, rank and local grade URL. The established DTM evidence reader now reads this owner-scoped source before its previous store when imported courses exist; explicit UUID report routes keep their original source. Imported overview evidence fits the16KB evidence budget for the47captured courses. Composition uses a compact record prompt and a35second/6000token budget bounded by the request deadline; the independent source verifier remains enabled.


The supplemental formatter explicitly validates imported grade payloads and local imported-course URLs separately from native local_demo reports. The complete47-course result, including evidence wrapper and URLs, is15,646bytes; the16KB bound applies to the whole result, not just the JSON source content.
