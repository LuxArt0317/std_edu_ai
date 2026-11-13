# Native tuition queries — Issue #98

## Observed source

The authorized tuition session showed four separate entries: 48-1 summer payment PDF instructions, 48-2 an Index redirect, 48-3 evening credit-fee PDF instructions, and 49-1 settlement search with no available period or record. The source shell measured 1,120 CSS pixels with 34px branding, 45px navigation and 31px breadcrumbs. Captures were at 60% browser zoom, with a CSS viewport of roughly 2,133 pixels; filenames containing `1280` do not establish a 1,280px CSS viewport. No official payment, application, printing or document issuance was performed. Private source screenshots and individual source values are not fixtures.

## Local implementation

The implementation is wired and migration180000 is applied; actual-JWT local acceptance passed. Publication and deployed acceptance remain pending. Separate account-owned settlements preserve period labels and nullable literal statements. The migration defines `affairs_tuition_settlements` and `affairs_tuition_document_metadata` with row-level security, explicit administrator writes, expected versions, durable retry receipts, audited transitions and deletion tombstones. Document kind and owner are immutable; revocation is terminal. It derives no academic year, fee amount, payment status or eligibility from text.

`TuitionDocumentsWorkspace` mounts the following source-shaped views through the existing portal:

| Local route | Implemented view |
| --- | --- |
| `/school-affairs/services/48-1` | Summer PDF instructions; Print disabled |
| `/school-affairs/services/48-2` | Observed extended-study Index destination; no invented document |
| `/school-affairs/services/48-3` | Evening fee PDF instructions; Print disabled |
| `/school-affairs/services/49-1` | Explicit settlement period selection/query, source explanation and empty state |

The selected-student manager opens explicitly from the existing record manager and uses the authenticated manager's session. It edits settlement and document metadata independently, preserves unknown (`null`) versus literal blank (`""`) values, and retains unsaved drafts after failures. Account switches abort pending work and hide stale account data. An uncertain unchanged request retains its request ID. A 409 conflict requires explicit refresh; a committed metadata creation whose response was lost can replay the exact request after refresh finds the same record. A different record occupying that document kind still blocks creation.

Both read contracts return `documents: []`. The transport rejects a nonempty document array, and the mounted workspace supplies neither a document nor an open-file callback. **All printing is disabled.** Metadata cannot issue a PDF, enable a download, establish payment or provide a Storage capability. The local footer and parent independent-site disclosure remain unchanged. The two new tuition tables are **not registered with assistant tools**; no assistant lookup or model acceptance for these records is claimed.

## HTTP and persistence contract

`GET /api/affairs-data?scope=tuition-documents` uses the verified caller's JWT, accepts no account filter and excludes administrative document metadata. `GET /api/affairs-data?scope=tuition-documents-admin&user_id=<selected-account-uuid>` requires live administrator authorization and one selected account. Repeated selectors, extra fields and unsupported `tuition-` scopes fail closed. Validated cursor reads are complete up to 1,000 rows per source; exceeding that bound returns an error rather than partial data.

`POST /api/affairs-manage` accepts exactly `{kind,payload}` for four operations:

- `save_tuition_settlement`
- `delete_tuition_settlement`
- `save_tuition_document_metadata`
- `delete_tuition_document_metadata`

Each payload includes `id`, `user_id`, `request_id` and `expected_version`, plus its kind-specific fields. Create uses version zero; updates and deletes use the saved version. The helper enforces the 26,000-byte JSONB payload limit and verifies the returned receipt. Existing API functions enforce a shared 17-second deadline for these operations; no new serverless function or university connection is added.

## Verified before release

| Check | Observed result |
| --- | --- |
| Initial component/client tests | 27 unit tests passed |
| Isolated synthetic browser | Five groups passed: known shell geometry, four-view 390/320 containment and Escape, empty query/disclosure, manager null save, and query/error/retry behavior |
| Integrated units | 33 tuition tests plus five existing DTM/certificate manager-host regressions passed: 38 total |
| Helper and actual-handler mocks | 52 tests passed, including tuition and neighboring syllabus/certificate/DTM dispatch regressions |
| Static checks | App, API and focused-unit TypeScript plus targeted lint passed |
| Independent review | Lost-response replay repair, selected-account handling and absent Print capability confirmed |
| Migration preflight | Rollback-only `20261112180000_tuition_documents.sql` passed five groups at the unchanged 127-migration/144-RLS-table baseline; synthetic rows, receipts, audit events and identities rolled back exactly; protected owner unchanged |
| Exact isolated release gates |545 API/source checks,231 units, forced TypeScript/build, lint, handoff, dependency audit and harness self-test passed |
| Full client verification |128 migrations/146 RLS tables, owner login/profile/CRUD cleanup, Edge authentication/directory and nonmutating OpenAI passed on retry after one transient timeout |
| Actual-JWT local acceptance | Six groups,67 API calls,20 browser requests, three synthetic callers, seven targets and12 successful administrator writes; exact cleanup, owner unchanged, no model/official calls |

The initial 27 tests overlap the later integrated checks; their counts are not additive. Synthetic browser evidence is under ignored `artifacts/tuition-documents-workspace/`. Its geometry assertions cover the 1,120px shell, 34/45/31px header/navigation/breadcrumb heights and `8px 20px 24px` main padding at a 2,133px CSS viewport. They do not establish full source pixel equivalence or accessibility conformance.

Offline checks can be repeated from the repository root with its installed dependencies:

```sh
node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test tests/unit/tuition-documents*.test.* tests/unit/dtm-submission-manager.test.tsx
node --experimental-strip-types --test tests/api/{tuition-documents,tuition-documents-handler,syllabus-search-handler,enrollment-certificate-handler,dtm-submissions-handler}.test.ts
node tests/integration/tuition-documents-live.mjs --self-test
```

The first two commands should report 38 and 52 passing tests. The third exercises only harness safety logic before environment, credential or connection loading; it is not actual-JWT acceptance.

## Remaining acceptance

Migration `180000` was planned and applied alone at the exact127/144 baseline. The client now has128 migrations/146 public RLS tables;190000 remains unapplied. Local actual-JWT run `5d5dc909-6a52-41b9-86b5-31d1458afc8b` passed all six groups, including all four routes, reload,390/320 containment, literal null/blank statements, revision conflicts, exact replay, terminal revocation, tombstones and cross-account isolation. All synthetic rows, receipts, audit events and identities were removed; protected owner unchanged and database/browser closed.

The first local run exposed an incorrect harness visibility wait for a deliberately blank, zero-height statement. That assertion now requires attachment and exact empty text. An intermediate rerun failed an immediate mobile assertion without a precise location; the diagnostic rerun passed. The harness now records the exact mobile phase and source line, and deployed repetition remains required. This does not establish full source pixel equivalence or accessibility conformance.

Live execution requires the root's serialized database lease and exact fixture cleanup. Deployed tuition acceptance is still pending. Positive administrator writes were verified through its real JWT/API, not administrator browser interaction. No issued document/PDF, official integration or tuition assistant-tool acceptance is claimed.
