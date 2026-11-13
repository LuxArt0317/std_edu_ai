# Student conduct records — Issue98

## Scope

Source38-1 was inspected read-only at the university's student conduct report. The authenticated source showed an independent student identity, an empty twelve-column report, and a download control. No document was requested or issued. Private screenshots and identity data remain ignored; all committed tests use synthetic records.

The local route is `/school-affairs/services/38-1`. Its account identity loads independently from conduct rows. Literal record cells preserve unknown `null`, blank strings and zero text. A caller cannot choose another account. An explicit administrator editor can create, update, clear and delete local records; collapse preserves its draft and retry state, while account changes unmount it. No official record synchronization, download or detail-document capability is supplied.

## Backend

`affairs_student_conduct` has caller-owned RLS, immutable owner/source, positive versions, soft-delete tombstones, a1000-active-record account limit and bounded complete reads. The two administrator operations require exact fields, a stable request ID and expected version. Durable receipts make an exact retry idempotent; changed retries or stale versions conflict. Audit records correspond to committed operations. Backend and SQL independently enforce trusted authorization and payload limits.

Migration `20261112200000_student_conduct.sql` remains **unapplied**. Its rollback-only preflight passed five groups at129 migrations/146 public RLS tables, verifying validation, ownership, trusted administration, receipts, tombstones, capacity and unchanged protected owner. All temporary schema/history/fixtures were rolled back.

## Verified locally

- Source desktop geometry at1280x720 matches within0.75 CSS pixels; the remaining name-input offset is0.516px and other compared values differ by at most0.032px.
- Six synthetic rendered groups pass: twelve headers/literal cells, disabled document actions,320/390 containment and keyboard table scrolling, identity and record retry, safe errors and foreign-account rejection. No external or API calls occurred; no serious/critical axe findings. This is not full pixel or WCAG certification.
- Eighteen focused host/workspace tests pass, including collapse/reopen draft preservation, actual selected-account routing, session removal, late-response rejection and uncertain-save replay.
- The isolated conduct candidate passed626 API/source checks,285 unit checks,302 offline evaluation checks, TypeScript/build/assets, handoff validation and dependency audit. Lint passed with existing unrelated warnings.
- Actual-JWT/deployed acceptance remains pending. The live harness requires future130 migrations/147 RLS tables and exact serialized release/database ownership; `--self-test` has no network or database access.

## Recheck

```sh
npx tsx --tsconfig tsconfig.unit.json --test tests/unit/student-conduct-routing.test.tsx tests/unit/student-conduct-workspace.test.tsx
node tests/integration/student-conduct-http-live.mjs --self-test
```

Expected:18 focused checks pass and the offline harness reports `databaseConnections:0`. Rendered evidence is under ignored `artifacts/student-conduct-workspace/`; the image fixtures contain no real student records. Live testing must wait for the lease, reviewed migration plan and explicit root execution.
