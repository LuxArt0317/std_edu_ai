# Academic Services verification

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98). The native academic runtime is published; production model/reference acceptance remains incomplete. Current certificate and file-submission progress is documented below and in DTM_SUBMISSIONS.md. Dated checkpoints retain their original status; isolated tests do not establish deployed UI parity.

## Source and account boundaries

The authenticated AcademicServices menu and its transcript, warning, ranking,
transfer, cycle, current-term and graduation views were inspected read-only on
November 12, 2026. Private screenshots remain in ignored, owner-readable local
artifacts. Actual school records are not fixtures or seeded client records.

The native destination is `/school-affairs/services/13-1`, with separate child
paths for each query. Catalog entry `15-1` uses the same observed AcademicServices
graduation application and must open the native graduation child. Entry `15-2`
points to a separately inspected older graduation service; it must not be
silently treated as an identical page. The module uses the independent
stu.best Google identity and
account-owned records. DTM assessment results, course-selection snapshots and
academic transcripts are different collections; one must not substitute for
another.

Captured transcript/warning/ranking headers have seven, five and four columns.
Term summaries, rankings, grade strings and status labels are stored explicitly.
`P`, `F`, withdrawal text, zero and missing values retain their separate meanings.
Neither the screen nor the assistant calculates pass status, GPA, summary credits
or graduation eligibility from these values.

The source current-term query was outside its published opening period. Transfer
and cycle queries displayed no records. Their populated source layouts have not
been observed; local absence does not establish that an official school account
has no records. Historical source dates are not current deadlines.

## Graduation report contract

The report is an atomic, versioned account-owned snapshot. Its metadata and
status text are explicit. Language checks and category summaries preserve the
stored required, completed, matched, excluded and missing credit values.
Categories contain requirement rows, each with zero or more matched-course
children. Other courses remain a separate list; a course may legitimately appear
in both lists. Neither deduplication nor eligibility calculation is appropriate.

Indicators are explicit `passed`, `attention` or absent values. A literal `N`
alone does not determine its icon. Collapse state changes only presentation;
individual category controls and the expand-all control do not alter data.

## Preflight results

Migration `20261112110000_academic_grade_records.sql` was exercised within a
rollback-only transaction against the exact client project. The test checked:

- Own-account, other-account, administrator and anonymous access to all four
  collections; direct and student writes remain denied.
- Per-kind keys, numeric/text types and ranges, immutable owner and record kind,
  natural-key collisions, optimistic versions and durable request receipts.
- Literal grades and rankings, zero versus null, explicit independent summaries,
  stable and late retries, audit counts and private receipt isolation.
- Existing protected-owner identity/profile hashes and exact fixture cleanup.

Before and after the transaction the live baseline remained 120 migrations and
131 public RLS tables. Both synthetic users and all four draft tables were absent
after rollback. This is a preflight result, not a migration application.

Focused draft checks passed: 12 API/source tests, five unit tests, TypeScript and
focused lint. The isolated browser suite passed source geometry within 0.6px,
390px and 320px containment, all four manager workflows, retry receipts and
stale-edit recovery. Nonmodal dropdowns corrected the open-menu focus issue;
Escape restores focus. No new serious or critical accessibility violations were
found beyond the documented source contrast exceptions. Synthetic screenshots
and results remain under ignored `artifacts/academic-grades-ui/`.

The graduation frontend has seven passing unit tests and uses the original local
Font Awesome glyphs. Its isolated browser suite matched the recorded desktop
heading and table coordinates within 0.02px. Checked source details include
negative heading letter spacing, two-pixel table-group dividers, nested table
padding and grey subtotal shading. The 390px and 320px layouts remain contained;
keyboard menus, Escape focus, table scrolling, expansion/reset, account filtering,
literal values, loading, errors and retry passed. Extra footer prose was removed
to match the source layout. Only specifically verified source contrast limitations
remain; no new serious or critical accessibility violations were found.

The structured graduation editor passed nested add/remove/reorder, stable IDs,
immutable owner, explicit UTC timestamp, null/zero, retry, dirty refresh and stale
version recovery checks. Shared validation enforces the 128 KiB payload and row
limits. Collapsed sections avoid mounting every input at once. The manager now has six passing DOM tests, including immutable report kind,
independent modern/legacy records, deleted-record guards and preserved microsecond
timestamps. Integration and publication remain pending. Isolated component tests
are not a deployed-feature claim.

The rollback-only graduation preflight passed on November 13 at the exact
121-migration/132-public-RLS-table baseline. It exercised strict recursive JS/SQL
validation, the exact 131072-byte payload boundary, immutable owner and report
kind, independent modern/legacy reports and versions, replay and stale conflicts,
private receipts, audit counts and own/admin/anonymous access. All draft DDL and
synthetic fixtures rolled back; protected-owner hashes were unchanged and the
connection closed. This single-connection test does not exercise parallel requests.

## Release acceptance

Before publication, integrate own/admin snapshot reads, local routing, manager
actions and private assistant selection. Apply only reviewed migrations after
the client database plan and serialized ownership handoff. Then exercise real
two-account persistence, direct link/reload behavior, stale edits and retries,
local citations and privacy boundaries locally and on production.

The graduation manager request needs its own bounded HTTP allowance above the
131072-byte SQL payload limit, including the small action envelope. Ordinary
manager action limits must remain unchanged. The snapshot must include only the
caller report on the student path and explicitly authorized reports on the admin
path; unrelated model answers must exclude these private report fields.

Reference geometry is captured at 1533×1399; the older transcript measurement is
1280×720. Compare each screenshot to its recorded viewport. Check 390px and 320px
containment and keyboard access independently. Source contrast exceptions are not
a claim of full accessibility conformance or complete pixel identity.

The full protected-service goal remains open; this batch does not complete the
remaining generic destinations or an official institutional integration.

## Next source: attendance query 14-1

Read-only inspection on November 13 opened the authenticated StuOffclass
statistics and detail pages directly. The summary has nine columns: student
number, name, course code, course name, full-term teaching hours, teaching weeks
to date, teaching hours to date, absence hours (`目前缺課時數`) and unexcused-absence hours.
Its local data contract must retain these explicit values; a count of detail rows
is not a substitute for stored teaching or absence hours.

The detail page has seven columns: course code, course name, teacher, category,
course date, period and roll-call timestamp. Course date and roll-call timestamp
are distinct: the source can record an earlier class at a later time. Preserve
both, including the original category label. The source explanations distinguish
`缺課` (absent with completed leave procedure) from `曠課` (absent without completed
leave procedure). Do not convert a local demonstration leave request into an
official attendance correction.

Both source pages are current-term queries, with reciprocal links and no observed
term selector or editing controls. Query navigation contains one attendance entry.
No additional source filter, disciplinary calculation or eligibility decision has
been inferred. Private source screenshots and sanitized geometry are held under
ignored `artifacts/visual-parity/absence-*-source.jpg` and `absence-*-layout.json`.
The fresh source header was measured at 1280×720: grey banner `#7c7c7c`,
blue menu `#006193`, 32.5px banner and 45.5px menu heights. The menu has one
attendance query entry; Index offers Index and Logout. The source Index URL
redirected to its separate CAPTCHA login when followed. The local Index keeps
the existing School Affairs home and independent Google session.

The native attendance draft uses three private collections: statistics, detail
rows and explicit current-term metadata. The student page must not select a term
by guessing from the latest saved row. Backend tests cover strict payloads,
independent totals, date-only versus zoned roll-call time, and owner filtering.
The schema remains unapplied and no attendance feature is claimed as shipped.

The isolated attendance suite passed at 1533, 1280, 390 and 320px. Measured
desktop shell, menu and table geometry matched within 0.008px. It exercised
current-term designation, strict ownership, null/zero/blank values, independent
course and roll-call dates, both query links, Escape/focus and keyboard table
scrolling. Only the specifically observed grey-banner and timestamp contrast
limitations remain. The manager has six passing DOM tests for all three writes,
immutable owner, optimistic versions, duplicate statistics, retry receipts,
current-term clearing and preservation of microsecond timestamps and empty text.
Fourteen focused backend tests passed. Daily, weekly and monthly hour totals are
not invented from term statistics or detail counts; one explicit ISO course date
can filter the detail records.

The shared reader and evidence projection are prepared separately from the
active assistant release. Evidence contains flat, account-filtered rows with
local URLs and omission counts; it excludes redundant identity fields and keeps
all explicit academic results, report indicators and attendance values literal.
The academic reader now validates all eight raw collections before mapping and
checks mapped row counts/ownership. Invalid report kinds or malformed owned/admin
rows reject the load instead of appearing as a complete empty history. Nineteen
focused reader/evidence tests, API TypeScript and lint passed.

Shared snapshots, routes and manager integration are connected locally. The
attendance rollback preflight passed on November 13 at the exact 121-migration /
132-public-RLS-table baseline after correcting a CASE-expression syntax error in
the unapplied draft. JS/SQL validation, independent statistics/details,
microseconds, null/zero/blank values, explicit current-term clearing, own/admin/
anonymous permissions, immutable owners, replay/stale/uniqueness conflicts and
audits passed. All draft DDL, private receipts and synthetic users rolled back;
protected-owner hashes were unchanged and the connection closed. The serialized
DB lease was released. Parallel requests are not covered by this single-connection
test. No native migration has been applied.

## Older graduation service 15-2

The authenticated `aca/grdcheckreport` destination was inspected read-only on
November 13. It renders a distinct fixed 960px report inside a grey background,
with a compact grey university strip, logo, five-column language table,
eight-column category table and nested seven-column requirement details.
Expand-all and individual category controls expose matched courses and explicit
subtotals. A separate six-column table holds other courses. Existing source
warnings and footer links are present. The observed public layout does not prove
that its values are interchangeable with the newer AcademicServices report.

Private captures and sanitized measurements are under
`artifacts/visual-parity/legacy-graduation-*`. No actual school record is copied
into client fixtures. The required `report_kind` separates `academic_services` and `legacy` records
with a unique owner/kind key. Each kind retains independent versions, receipts
and local source URLs. Unknown kinds are rejected; missing modern data is never
filled from the legacy report. The distinct legacy renderer is now mounted at15-2 locally. Its real-HTTP
isolated browser checks pass, with table/frame geometry within0.063px of the
reference, exact footer spacing and all nine bitmaps verified. The source top
link retains its measured low-contrast color; zero new serious/critical Axe
findings were reported. This does not establish production delivery. Its nine observed
public bitmap assets return HTTP200 image responses with exact bytes from the
restarted local Vite server. All nine are now registered in the mirror asset
manifest with locally verified byte lengths and SHA-256 digests. Production
serving remains a release check; a fixture response is not evidence of public
delivery.

## Moodle grade layout follow-up

The existing source-backed course and grade geometry remains intact. A narrow
follow-up restores the solid navigation sitemap glyph, grade-group indentation
and weight, nested row indentation and the total `Σ` marker. It reuses the local
font asset and leaves unsupported totals blank. Arbitrary saved grades are not
mislabelled as assignment activities merely to reproduce an icon.

The isolated browser run passed source geometry, record controls, desktop and
768/390/320px containment, with no serious or critical accessibility violations.
The original Moodle session was restored through its existing Google session
on November 13. The `/my/` dashboard has now been captured privately and measured
at 1280px. This account has course terms in its left navigation but an empty
23px white center panel. The local dashboard still shows course cards and omits
two source sidebar blocks; its avatar, heading and breadcrumb spacing also differ.
This discrepancy remains open. The observed empty dashboard is one account
configuration, not evidence that all Moodle dashboards are empty. The source
customization button was not activated and its editing workflow is unverified.
`artifacts/dtm/dashboard-1440.png` depicts the home page and must not be used as
dashboard parity evidence.


## Remaining selection applications

After the user restored the school session on November 13, entry7-1 displayed
an August3–October2,2026 application period. The user explicitly approved its
acknowledgment for inspection only. Following the observed button returned to
the entry page and exposed no application form. Transfer entry7-2 displayed an
August3–September24,2026 period; its Enter button likewise returned to the entry.
The transfer-history page showed its no-record explanation; no populated layout
was available. Course-confirmation entry6-6 returned to the existing selection
query page. No application, preference or official record was submitted.

These observations do not establish an open-window application workflow or
approval schema. Do not silently reinterpret native history rows as confirmed
applications. Sanitized route/availability evidence is recorded in ignored
`artifacts/visual-parity/selection-application-availability.json`.


## Native integration checkpoint — November13

The portal now mounts12 native grade, graduation and attendance paths, including
the15-1 modern alias and independent15-2 legacy report. The existing manager
transport hosts separate grade, graduation and attendance editors. Snapshot
reads use the caller JWT, page all eight sources and validate every persisted
row before reporting completeness. Administrative records and owner labels stay
inside the explicit admin scope.

The eight manager operations use their dedicated database RPCs and preserve
version conflicts. Only the graduation request accepts a140000-byte UTF-8
envelope for the131072-byte SQL report limit; other request limits are unchanged.
The attendance validator now rejects inherited/unknown operation names without
throwing a TypeError. Older test fixtures now use valid synthetic UUIDs.

Verified locally:380 full API tests (including94 focused native/integration and16 assistant/evidence checks), app/API
TypeScript, focused lint,12 manager DOM tests and isolated route/save/refresh
checks. The route smoke used synthetic responses and made zero API requests;
it is not live database evidence. A separate read-only integration review found
no additional concrete defects.

Draft migrations110000,130000 and140000 are not applied. Native assistant
tool/evidence/view wiring, production asset
delivery and two-account live release checks remain outstanding. Shared
release ownership stays with the concurrent answer-verification work.

## Moodle assignment detail

The source assignment detail and submission editor were inspected read-only.
The editor was canceled without saving. Its dedicated status page has separate
submission and grading state, due date, timing result, submission-content
modification time, submitted files and excellent-work rows. The current local
tracker modal does not yet implement that page or a private submission-file
workflow. Tracker updates and self-marked submission timestamps must not be
relabeled as verified file-submission status. The observed source file limit
(2GB, one attachment) does not establish the client's storage quota.

Private layout evidence is in artifacts/visual-parity/dtm-assignment-* and
dtm-submission-editor-*. The source PDF icon was downloaded as a589-byte public
PNG and is now registered in the mirror asset manifest. No private filename or
school submission content is used in client fixtures.

The standalone assignment report panel now matches the measured source panel,
headings, table and action geometry within 0.1px at 1533px, including the one-pixel
content spacer, exact outer shadow and PDF icon padding. The isolated 390px and
320px checks pass with no page errors or API calls. Seven unit tests, TypeScript
and focused lint passed. This does not establish full-page parity: the isolated
harness does not mount the course shell, and the component is not yet connected
to the real submission backend. Both the detail and editor remain unmounted.

The controlled submission editor has separate saved and pending file state,
one-file selection, Save/Cancel, upload progress and retained retry state. Its
isolated synthetic suite records passing desktop geometry and 390/320px
containment, with zero API or external requests. The observed blue Save/Cancel
buttons retain specifically documented source contrast limitations; this is not
full-page pixel parity or complete accessibility conformance.

All 17 observed native assets are now registered in
`src/features/public/mirror/assets.json`: nine legacy graduation bitmaps, one
assignment-detail PDF icon and seven submission-editor icons. Each local file's
format, length and SHA-256 digest was checked, including the captured checksums
where present. The registered fields are `source`, `file`, `checksum`,
`sourceChecksum` and `bytes`. Existing manifest rows were preserved. No remote
request was made for this registration, and production serving remains untested.

Draft `20261112150000_dtm_submissions.sql` now defines independent private file
submissions and administrator reviews; it remains unapplied. One immutable
account/assignment linkage owns one current file and one pending reservation.
Save validates actual Storage metadata before committing; cancellation discards
only the pending edit. Versions and durable request receipts protect retries.
Reviews are independently versioned and attached to the exact saved file, while
replacement becomes ungraded. Tracker statuses are not migrated into submission
or grading facts. The proposed local limit is 10 MiB, not the observed source's
2 GB allowance; hosted capacity still requires verification.

The dedicated server helper uses the caller JWT, a total 12-second operation
budget or earlier caller deadline, and a five-path/eight-second cleanup pass.
Deleted-but-unacknowledged paths remain queued. Deleted accounts need an
authorized admin cleanup sweep. Saved-file downloads use 60-second attachment
capabilities; filenames, bytes, paths and signed URLs must remain outside general
or model snapshots. Sixteen mocked tests, API TypeScript and focused lint pass.
The rollback/RLS harness is prepared but unexecuted. Real Storage upload/download,
simultaneous finalization/cancellation, physical cleanup and two-account live
persistence are outstanding; no backend release is claimed.

## November 13 integration checkpoint

Reviewed migrations110000,130000 and140000 were each planned and applied independently to the configured client project. The database is now124 migrations/140public RLS tables. Submission150000 remains an independent, unapplied draft. Current local API suite418/418 and unit suite93/93 pass; app/API TypeScript and lint complete (repository lint has pre-existing warnings). The native assistant has explicit tools, own-only evidence and compact views. Actual model/browser acceptance is still running; no production feature claim is made at this checkpoint.

## November13 serialized acceptance checkpoint

All427 current API/source checks and93 unit tests pass after the precise native
evidence-selection fixes. Local deterministic grades and attendance runs verified
real caller-owned data, private answers, native navigation and phone containment;
they do not exercise the model provider. The strengthened harnesses now require
the existing verified administrator JWT and send writes through the manager API.
Their positive saves, errors, replay, owner integrity and exact cleanup are being
rerun before publication. The graduation harness also covers a valid report above
12KB without exceeding its dedicated bounded envelope.

The legacy graduation expanded bitmap now changes immediately under reduced
motion. The shared transition rule previously left the closed bitmap briefly
visible; an isolated source-geometry regression passed after the scoped fix.

The enrollment-certificate source was inspected through the actual portal link
on November13. It has a centered1120px shell, four-column eligibility query and
a blocked-state message. No source document was generated. Private source account
values remain excluded from code and tests. Its frontend reconstruction is a
separate unmounted draft.

The strengthened local suites now pass for all three families: grades run966f87dc,
graduation runb6f191f0 and attendance rerun on November13. Every administrator
write uses an actual verified JWT through the manager handler. Grades/attendance
each verify nine durable receipts/audits; graduation verifies four and a19485-byte
valid request. All exact fixtures were removed and owner profile integrity was
verified. Local answers remain explicitly deterministic. An attendance navigation
assertion now waits for the destination table instead of reading the preceding
page during React navigation; the corrected full suite passed.

Focused review also corrected noun-only multipart native requests falling into
public research. The API and planner share the same native tool detector; public
navigation and DTM wording remain distinct.429API/source tests pass after that
fix. Current production build is index-CJrI57zo; deployed-model acceptance remains
pending until the application release is Ready.

The exact staged release set independently passes411API tests and79unit tests.
The larger429/93 workspace totals include separate unmounted submission drafts.
Original CRLF bytes in five captured public SVGs are deliberately preserved for
source checksum identity; source/code whitespace checks otherwise pass.
