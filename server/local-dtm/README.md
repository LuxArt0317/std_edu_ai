# Local Moodle library

Owner-scoped SQLite storage for user-authorized DTM captures. Tables retain courses, pages, activities, literal grade rows and import batches. No authentication cookies, source session keys or university passwords are saved. Imports upsert transactionally and do not erase uncaptured pages. Source URLs are restricted; source content is rendered as text, not executable HTML.

Set `LOCAL_DTM_DATABASE` to an absolute private file path and `LOCAL_DTM_IMPORT_EMAIL` to the authorized importing Google account in the ignored local environment. Open `/dtm/import` while signed in; paste the capture JSON and import. Only the loopback development server exposes the import route, requires a same-origin POST and validates the Google bearer session. Hosted environments disable the library and cannot import. Back up the private database separately; it is not a Git asset.

`GET /api/affairs-data?scope=dtm-library` lists the caller's courses and coverage. Add `course_id`, `page_key` or `q` to read source pages. This is the same authenticated API available to the assistant. All SQL selections bind the verified caller ID; another user's rows are never returned. Missing captures remain unavailable. No enrollment, final-grade calculation, submission or download is inferred from activity listings.
