# Native syllabus search — Issue #98

## Scope and source

The signed-in local service `/school-affairs/services/12-3` follows the observed university syllabus query at `https://info.stu.edu.tw/ACA/teacher/Syllabus/MainCoursequery.asp`. Source inspection was read-only. Current and historical are distinct: historical includes current records; multiple teaching themes use ANY matching. The observed historical source returned524 rows; an earlier39-row observation was incomplete. No official personal records were imported.

The local search reads published administrator-maintained offerings. Three nullable metadata fields explicitly record current membership, academic-year text and semester text. A course catalog is not evidence of a student's enrollment. Unknown metadata is not inferred from its label or today's date.

## Implementation

`server/syllabusSearch.js` validates caller-JWT queries, stable bytewise sorting, complete options, published-only details and separate audited metadata updates. Migration170000 adds metadata and bounded search RPCs without backfilling records. The client collects all100-row pages within one30-second deadline, rejects changed revisions, inconsistent totals, duplicates, malformed responses and more than1000 results, and immediately aborts/hides data when identity changes. Local detail and Back preserve filters.

The course manager and search metadata editor share row versions but have separate writes. Dirty edits in either editor lock the other editor and account/course switching until save or an explicit reset. Legacy saves preserve search metadata.

## Verified so far

- Rollback-only database preflight:8 groups,104 synthetic offerings,3 users; exact rollback and protected owner unchanged. Only170000 was subsequently applied after the reviewed exact126/144 plan;180000/190000 remain deferred.
- Standalone source geometry and layout:9 browser checks; original contrast limitations retained for fidelity, not claimed WCAG compliant.
- Mounted mocked API/browser:8 checks including101-result pagination, detail/back, unavailable/revision-error states and390/320-pixel containment.
- Independent focused units:32 passed, including1000-row paging, deadlines, identity aborts, retry/conflict and dirty-editor reset rules.
- Actual-JWT live harness passed independent cleanup-race review and its offline self-test: ambiguous Auth creates and writes retain a recovery ledger until exact identities/receipts are reconciled. Local actual-JWT acceptance subsequently passed:5 groups,159 API requests,23 browser API requests,103 synthetic offerings and3 disposable callers. Exact fixture/receipt/audit cleanup and protected-owner preservation passed; no model or official-school requests. Evidence: `artifacts/syllabus-search/local-df58ceef-1e65-4745-87cf-cfe0e9f39205/result.json`. Production acceptance remains pending.
- Exact staged candidate:524 API/source checks,198 units, forced TypeScript/build, lint,88-document handoff and zero-vulnerability audit passed.

## Required release acceptance

The exact170000 migration plan/apply completed under the serialized client database lease; expected post-apply baseline is127 migrations and144 public RLS tables. Run `tests/integration/syllabus-search-live.mjs` locally, then against the exact deployed revision. It creates only disposable synthetic client records; receipts, audits, identities and offerings must all be reconciled and removed, preserving the existing owner fingerprint. An uncertain remote mutation must be resolved before cleanup.

Production source geometry, institutional integration, and every remaining protected service are not implied by these focused checks.
