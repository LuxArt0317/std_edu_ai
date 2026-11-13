# Moodle submissions and certificate acceptance

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98) remains open. This checkpoint covers independent stu.best records, not university synchronization or submissions.

## Implemented boundaries

- Course assignment links open the source-shaped detail page and its separate editor. Saved files, pending uploads, personal tracker status and administrator grading are separate facts.
- Each account-owned assignment has at most one current file and one pending reservation. The local limit is 10 MiB. Save/Cancel and reviews use immutable ownership, expected versions and durable retry receipts.
- Downloads require the caller's account or verified manager access and receive a 60-second capability. The browser receives bytes; file capabilities never enter general assistant evidence.
- Cleanup handles at most five database-selected paths per call. Successful submission receipts survive cleanup failure. Managers can request another bounded pass; the UI does not claim all files were removed when another batch remains.
- Certificate service17-1 uses a dedicated personal endpoint and a selected-student administrator assessment editor. The observed source state was blocked. Unknown values stay unknown, and document metadata cannot activate or issue a certificate.

## Completed checks

Migration150000 is applied. The actual Storage suite passed ten checks with 11 uploads/298 bytes, 14 downloads, 71 helper calls and three concurrent Save/Cancel races. Eight additional browser checks passed through the local mounted UI, actual handlers and real database: course navigation, upload/download/reload, replacement, interrupted pending recovery, cancellation, narrow layouts and another account's denied request. The UI made 35 API requests, three uploads/81 bytes and three downloads, without browser/bridge errors.

The exact disposable accounts, objects, queue rows and owner fixtures were removed; the protected owner's records were unchanged. The recovery ledger is private and ignored. These checks establish local runtime/database behavior; deployed HTTP acceptance is a separate gate.

Migration160000 passed rollback-only preflight, exact application and post-apply regression: strict JS/SQL payload parity, owner/cross-account/anonymous reads, denied direct writes, administrator versions/replays, immutable linkage, metadata-only documents and exact cleanup. Current baseline is 126 migrations/144 public RLS tables.

Synthetic certificate browser checks exercise the actual catalog link, dedicated personal scope, retry and foreign-response rejection. Desktop geometry differs by at most 0.65px in measured elements, with390/320px containment. Source-inherited contrast exceptions are recorded; this is not a blanket accessibility certification.

Actual certificate JWT/browser run `9f84eef3-b96f-4b63-bbd9-505ef149f67d` passed: administrator writes/replay, caller/cross-account reads,401/403/400/409 paths, immutable ownership, catalog17-1 navigation, blocked/unknown/null/blank states and390/320px containment. Three exact audits/receipts and all synthetic fixtures were removed; the owner fingerprint was preserved. No document or model operations occurred.

The exact staged candidate passed476API/source tests,158unit tests, forced TypeScript, lint, production build, handoff and a zero-vulnerability dependency audit. Preview/production HTTP acceptance remains separate.

## Running the checks

From the client checkout, with its existing runtime and private configuration:

```sh
node --experimental-strip-types --test tests/api/dtm-submissions*.test.ts tests/api/enrollment-certificate*.test.ts
node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test tests/unit/dtm-submission*.test.tsx tests/unit/enrollment-certificate*.test.tsx tests/unit/certificate-record*.test.tsx
node tests/integration/enrollment-certificate-ui.mjs
```

Real Storage tests create temporary client fixtures. Serialize them with the live-test owner recorded in `agent/A2A.md`:

```sh
node_modules/.bin/tsx tests/integration/dtm-submissions-storage-live.mjs --execute --expected-migrations=126 --expected-rls=144 --browser-origin=http://127.0.0.1:5184
```

Expected output reports passed checks, zero fixture leftovers and unchanged owner records. Do not treat a passing local handler run as deployed-model or production-UI acceptance. Production browser mode and actual-JWT certificate acceptance are the remaining release checks for this batch.
