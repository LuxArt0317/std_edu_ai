# Dormitory Conduct

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98). The native local route is `/school-affairs/services/34-2`. Published and production-accepted in runtime400abb07df6c2c2e0247a0634e4d338e70f5df0c. Migration `20261112220000_dormitory_conduct.sql` was applied after the exact client plan at132 migrations/149 public RLS tables.

## Observed source

The authenticated source entry is `https://info.stu.edu.tw/sao/DMT_PUNISH/index.asp`, with the read-only student query at `https://info.stu.edu.tw/SAO/DMT_PUNISH/item/qryStuData.asp`. The observed result is an event-message page displaying `您尚未有任何住宿的獎懲記錄.` and a HomePage link. No populated record columns, disciplinary details, student editor or housing workflow were observed. The native route therefore renders this message-page family rather than inventing a report table.

Official DOM measurements at 1280×720 establish a 922px outer frame, 832px inner content and 790px heading, with the measured blue borders, JhengHei font stack and floated image wrappers. Two observed public PNG assets are copied locally; URLs, sizes, dimensions and SHA256 checksums are in `public/stu-reference/dorm-conduct-assets.json`. That manifest contains no private event-message query or identity. Private source evidence stays in ignored artifacts; tests use only synthetic accounts.

The isolated rendered comparison checked thirteen source rectangles: x and width match exactly; the maximum remaining y/height delta is 1.024 CSS pixels. This Chromium context rounds the retained source 1.5px heading border to 1px, with small additional font/padding rounding. The source-derived desktop design is adapted for contained 390px and 320px layouts. This does not establish universal pixel equivalence across browsers or populated source states.

## Caller and manager behavior

`SchoolAffairsPortal` mounts `DormConductWorkspace` directly at34-2, outside the generic tracking shell. It independently obtains the account identity through the existing account reader. A loading, failed, missing or foreign identity prevents an empty-record claim even when the metadata request completes. The HomePage callback navigates to `/school-affairs`; it does not redirect to the university system.

The personal transport uses `GET /api/affairs-data?scope=dormitory-conduct` and accepts only `{snapshot:null}` or an exact snapshot containing the caller's `userId`, `sourceMode:local_demo`, a positive bounded `version`, and `result:empty|unknown`. Null means unknown. Administrator reads use the separate `dormitory-conduct-admin` scope with one explicit `user_id` and return `{record}` including its stable identifier and timestamps. Personal responses cannot contain that administrator shape or document capabilities.

`SchoolRecordManager` opens the Dorm manager only on an explicit action, with the selected student's account ID and the authenticated manager's ID. It retains the mounted editor while hidden for the same account. Selection or authentication changes unmount the old editor and abort pending operations. No form is shown before a successful, validated administrator read.

Writes use `POST /api/affairs-manage` with `save_dormitory_conduct` or `delete_dormitory_conduct`. Both require `id`, `user_id`, `request_id` and `expected_version`; only save adds `result`. The manager supports only explicit unknown or empty metadata. An uncertain unchanged write retains the exact request identity across refresh and collapse. HTTP409 requires a refresh while preserving the selection for comparison. A replacement singleton or removed record requires explicit draft discard; deleted identifiers are not reused. A confirmed write with a failed read is not resubmitted until its resulting state can be verified.

The client captures the caller and immutable payload before asynchronous work, rechecks the session after responses, uses a single 30-second deadline and limits response bodies to 4096 UTF-8 bytes. Provider details are not displayed. The backend's proposed payload limit is1024 JSONB bytes. These are independent local metadata records, not university synchronization or proof of official disciplinary status. This batch does not register a new assistant tool.

## Verification and pending gates

- Six view tests and eighteen client/workspace/manager tests passed, covering own-account validation, safe unknown states, exact payloads, strict receipts, deadlines, cancellation, stale results, replay, tombstones and conflict-preserved drafts.
- Five new mounted routing tests cover34-2, independent identity/retry, local HomePage, account-switch cancellation, selected-owner administration, hidden draft/retry preservation and authentication loss. Existing Loan and Conduct routing tests are retained as regressions.
- The previously run isolated browser harness passed five groups with no forwarded network requests. Desktop geometry, 390/320 containment, source images, navigation, safe errors and empty/error axe checks passed with zero serious or critical findings in those checked states. This is not a full WCAG conformance claim.
- Independent backend, UI/client and live-harness reviews found no actionable findings. Ten backend and ten injected handler tests passed. Rollback lifecycle contracts passed16 checks and a60-case zero-connection self-test; the actual-JWT harness passed21 offline lifecycle contracts. These do not prove live execution.
- Focused TypeScript and lint checks cover the integration. No new browser, database, model or official-school request was used for mounting. Actual-JWT persistence, mounted-browser CSS interaction, migration application and production publication remain pending. Offline fixtures do not prove those gates.

Run from the client checkout:

```sh
TSX_DISABLE_CACHE=1 ./node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test tests/unit/dorm-conduct.test.tsx tests/unit/dormitory-conduct-client.test.ts tests/unit/dormitory-conduct-workspace.test.tsx tests/unit/dormitory-conduct-routing.test.tsx
./node_modules/.bin/oxlint src/features/public/affairs/SchoolAffairsPortal.tsx src/features/public/affairs/SchoolRecordManager.tsx tests/unit/dormitory-conduct-routing.test.tsx
```

Expected:29 focused tests pass and lint reports no findings. Live acceptance requires the separately held database lease and explicit execution authorization; this document does not authorize it.

November13 rollback-only preflight passed all5groups on the exact131-migration/148-public-RLS-table client baseline. Migration220000 was applied only inside a rolled-back transaction. JS/SQL strict states and byte bounds, role/owner isolation, serial version/replay, tombstone/new-ID lifecycle and6 exact receipts/audits passed with3 synthetic users and5 record IDs. Full schema/history/fixture restoration and protected-owner fingerprint checks passed; cleanupVerified and connectionClosed were true. No actual JWT/API/UI/model or parallel-RPC acceptance is implied. The later permanent application selected only220000 and completed at132/149; the transaction-only evidence above remains a distinct earlier check. Private log: /tmp/stu-dorm-rls-preflight.log.

## Configured candidate acceptance — November13

Only220000 was permanently applied after the exact plan. The configured isolated candidate passed896 API/source checks,363 units, TypeScript/build/asset validation, lint, handoff and dependency audit0. Actual-JWT local7a3ab8b7 passed all7 groups:85 HTTP calls,32 browser API calls and6 successful audited writes, including absent-versus-empty states, permissions, direct RLS, replay/stale/tombstone/new-ID transitions, account reload/switch and390/320 containment. Exact fixture cleanup, connection closure and protected-owner preservation passed; blocked/model/download/official calls were0. Production acceptance subsequently passed as recorded below.

The initial localb824b8ca stopped at browser readiness before writes;9 HTTP/0 browser calls and0 writes, with exact cleanup. It is retained as failed. After linking the authorized ignored environment configuration and rebuilding, the configured candidate passed; no runtime code or acceptance bounds changed. Live administrator-browser editing, parallel RPC conflict behavior and populated source records remain unverified.

## Production acceptance — November13

Runtime400abb07df6c2c2e0247a0634e4d338e70f5df0c is Vercel Ready EPE1q3rqFCSJbkcMF9swjiSBfUFX, with exact public manifest and successful Quality43388722996. Production d145f4ce passed the same7groups through deployed HTTP only:53 HTTP calls,32 browser API calls and6 successful audited writes. Exact fixture cleanup, connection closure and protected-owner preservation passed; blocked/model/download/official calls were0. The production and configured-local desktop screenshots have identical SHA2566bc2e09d57681d1c821298e5b88cbd6022d4a958736e37a94495a50e778ed061. This proves equality for that captured state, not all source states or browsers.

The earlier initial-mounting/pending statements are historical. Live administrator-browser interaction, parallel RPC conflicts, populated institutional records and a dedicated assistant reader remain outside this accepted scope.
