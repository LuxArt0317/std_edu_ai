# Student conduct records — Issue98

## Scope

Source38-1 was inspected read-only at the university's student conduct report. The authenticated source showed an independent student identity, an empty twelve-column report, and a download control. No document was requested or issued. Private screenshots and identity data remain ignored; all committed tests use synthetic records.

The local route is `/school-affairs/services/38-1`. Its account identity loads independently from conduct rows. Literal record cells preserve unknown `null`, blank strings and zero text. A caller cannot choose another account. An explicit administrator editor can create, update, clear and delete local records; collapse preserves its draft and retry state, while account changes unmount it. No official record synchronization, download or detail-document capability is supplied.

## Backend

`affairs_student_conduct` has caller-owned RLS, immutable owner/source, positive versions, soft-delete tombstones, a1000-active-record account limit and bounded complete reads. The two administrator operations require exact fields, a stable request ID and expected version. Durable receipts make an exact retry idempotent; changed retries or stale versions conflict. Audit records correspond to committed operations. Backend and SQL independently enforce trusted authorization and payload limits.

Migration `20261112200000_student_conduct.sql` is applied after an exact-version plan; Loan210000 was deferred. The client baseline is now130 migrations/147 public RLS tables. Its rollback-only preflight passed five groups at129 migrations/146 public RLS tables, verifying validation, ownership, trusted administration, receipts, tombstones, capacity and unchanged protected owner. All temporary schema/history/fixtures were rolled back.

## Verified locally

The School Affairs assistant can answer an exact count of your saved conduct report rows. It uses one caller-scoped exact-count request, selecting only an ID and owner for the consistency check. The chat exposes the count and the 38-1 record link. A failed or inconsistent read is retried under the same owner scope and can never become a saved zero. The count covers undeleted saved rows. It does not sum merit or demerit quantities or apply an academic-term or void-status filter. Run `node --test tests/evaluation/student-conduct-count.test.mjs` for the actual-handler evaluator with controlled data transport.

- Source desktop geometry at1280x720 matches within0.75 CSS pixels; the remaining name-input offset is0.516px and other compared values differ by at most0.032px.
- Six synthetic rendered groups pass: twelve headers/literal cells, disabled document actions,320/390 containment and keyboard table scrolling, identity and record retry, safe errors and foreign-account rejection. No external or API calls occurred; no serious/critical axe findings. This is not full pixel or WCAG certification.
- Eighteen focused host/workspace tests pass, including collapse/reopen draft preservation, actual selected-account routing, session removal, late-response rejection and uncertain-save replay.
- The isolated conduct candidate passed626 API/source checks,285 unit checks,302 offline evaluation checks, TypeScript/build/assets, handoff validation and dependency audit. Lint passed with existing unrelated warnings.
- Actual-JWT local run6ee6d6a6 passed six groups:44 HTTP/12 browser calls,7 successful writes, own/admin/anonymous boundaries, exact replay/conflicts, literal cells, reload,320/360 containment and synthetic Google-identity revocation. Exact fixture cleanup and protected-owner preservation passed. No model, official service or download calls occurred. Production repetition below passed; `--self-test` has no network or database access.

## Recheck

```sh
npx tsx --tsconfig tsconfig.unit.json --test tests/unit/student-conduct-routing.test.tsx tests/unit/student-conduct-workspace.test.tsx
node tests/integration/student-conduct-http-live.mjs --self-test
```

Expected:18 focused checks pass and the offline harness reports `databaseConnections:0`. Rendered evidence is under ignored `artifacts/student-conduct-workspace/`; the image fixtures contain no real student records. Live testing must wait for the lease, reviewed migration plan and explicit root execution.

## Published acceptance

Runtimefcac3c4 is Production ReadyEwVRJUodYYtGubUjPD1i61ozUiiC, exact public release manifest verified and Quality43369577520 successful. Actual-JWT deployed runb8c64115-5430-490a-b2cf-1de3ed6fe9c4 passed all six groups with32HTTP/12browser requests and7 successful audited writes. Both320/360 immediate and settled document widths equal the viewport. Exact fixture cleanup and unchanged protected-owner profile were verified. No official service, model or download calls occurred; administrator writes used real JWT HTTP, not the administrator browser UI.

Initial production runc8ed908d failed an immediate viewport assertion but cleaned all fixtures. The diagnostic rerun waits two animation frames while retaining the same one-pixel containment tolerance. Local checks include all native portal CSS and the public wrapper; no stylesheet defect was reproduced. The harness retains one reserved physical database session, checks the exact advisory lock/PID and aborts on sticky lease loss instead of reconnecting. Failed geometry diagnostics exclude account text and values. Final offline review added guarded BEGIN/COMMIT/unlock dispatch and regressions for a session-loss microtask after a successful lock probe; the paired Conduct/Loan suites pass38 offline contracts. These are test-harness changes, not production runtime changes.
