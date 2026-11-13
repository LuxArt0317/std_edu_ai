# Student Loan

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98). The native local entry is `/school-affairs/services/21-1`, with `/progress`, `/history` and `/document` subpages. Published as `0731bdaaec6f456608e722ffad89bfc895aa95eb` on 2026-11-13. Vercel deployment `3x7Pug9HFNkwB8pB1hMcmQ7bu3Ca` is Ready, the public release manifest matches, and GitHub Quality `43377851990` passed.

## Observed source and limits

The authenticated source index, current-term no-application popup, empty-history popup and empty document result were inspected read-only. No university application, payment, record edit or document issuance was performed. The source's loan information link maps to the existing local public capture. Private screenshots and account details remain in ignored artifacts; committed tests use synthetic data.

The copied view preserves the source header, navigation, action labels and popup layout. The document control opens a local status page in a new tab; it cannot create, print or download a loan document. Unobserved application forms, eligibility, loan amounts, approval and payment workflows are not represented by this metadata view.

## Account data and administration

Migration `20261112210000_student_loan.sql` stores one active literal snapshot per account. The current-term label, application text, progress text, history text and history count preserve null, blank and zero separately. Application state must explicitly be `unknown`, `not_applied` or `recorded`. A missing row is unknown, never proof of no application or zero history. These independent site records are not university synchronization.

Personal reads use `scope=student-loan` with the verified Google caller's JWT. Administrator reads require `scope=student-loan-admin&user_id=<selected-account>` and a current authorization check. Both scopes reject additional filters, repeated selectors and mixed conversation resources. Versioned `save_student_loan` and `delete_student_loan` operations use strict payloads, audited receipts, immutable ownership and tombstones. Soft-deleted identifiers cannot be reused; a new identifier can replace a removed singleton. Maximum payload size is 32,000 JSONB bytes, within a 33,024-byte API envelope.

The selected-account manager retains drafts and the exact uncertain request when collapsed. Account changes abort old requests and clear the editor. Refresh after a conflict preserves the draft for comparison; an uncertain response retries the same request identifier. The UI does not claim success until the saved state is re-read. No assistant tool is registered for this new snapshot yet.

## Verification

- Independent backend review and 12 offline tests passed, including literal validation, caller capture and malformed data rejection.
- Client/workspace/view checks passed 29 tests. Independent review of the transport and manager found no actionable issues.
- Root integration checks cover strict API scopes, actual handler dispatch, local route transitions, document navigation, selected-account routing and collapsed draft preservation.
- Synthetic rendered checks passed desktop measurements within 0.024 CSS pixels and containment at 320/390 widths, with popup dismissal and focus restoration. Known source contrast warnings remain; this does not establish complete pixel or accessibility equivalence.
- The isolated candidate over production d5abe29 passed829 API/source checks,318 units, TypeScript/build/assets, lint, handoff validation and a clean dependency audit. The test-only viewport diagnostic change separately passed19 lifecycle contracts and syntax checks.
- The rollback-only harness passed 117 offline contract cases, diagnostic/serializer regressions and independent review. Its first two live preflights failed: the initial broad validation/ACL label was narrowed to the invalid-NUL probe. Both runs restored the exact schema, history, fixtures and protected owner and closed the connection. The cause was test-driver JSONB double-encoding of raw JSON strings, corrected by binding through `::text::jsonb`; it was not a schema defect.
- The corrected rollback-only preflight passed all five groups on 2026-11-13 at the exact 130-migration/147-public-RLS-table baseline. It verified JS/SQL validation and byte boundaries, role isolation, singleton/version/replay behavior, literal null/blank/zero, held advisory locks, tombstones and new-ID replacement. Three synthetic users, five reserved record IDs and nine successful request receipts were confined to the transaction. Full schema/history/fixture/audit rollback and protected-owner fingerprint restoration passed with `cleanupVerified: true` and `connectionClosed: true`. Local evidence: `/tmp/stu-loan-rls-preflight-fixed.log`.
- Migration `20261112210000` was planned and applied alone to the exact client project:131 migrations/148 public RLS tables; Dorm220000 was deferred. Actual-JWT local run ca09d2fe verified authentication, own/admin isolation, singleton writes, replay and stale/ownership checks, then failed an immediate mobile-dialog bounds assertion (28 HTTP/6 browser calls,3 writes). Exact cleanup and protected-owner preservation passed. The diagnostic rerun `1036b7cc-4700-479f-bfda-89fba1f7ed61` passed all seven groups:52 HTTP/16 browser calls and7 audited writes, own/cross/anonymous/nonadmin/Google-revocation isolation, literal null/blank/zero, retry/stale/tombstone/new-ID lifecycle, reload and local document status. Exact fixtures/receipts/audits were removed and the protected owner was unchanged. Immediate mobile geometry was stale; after two animation frames the dialog had10px margins at360/320 widths. Bounds were unchanged and no product CSS change was necessary. No model, file issuance, official operation or live administrator-browser acceptance is claimed. Production run `41476619-45e1-4a83-bfc6-0d4e15c445a8` passed all seven groups against that exact revision:36 HTTP/16 browser calls and7 audited writes,320/360 containment, reload and cross-account isolation. Cleanup was verified with no failures and the protected owner unchanged. No model, school operation, payment, application or document capability was exercised. The rollback test uses SQL claim roles and checks held locks and stale operations; it does not prove parallel RPC execution.

Offline checks, run from the client checkout:

```sh
node --experimental-strip-types --test tests/api/student-loan.test.ts tests/api/student-loan-handler.test.ts
node tests/integration/student-loan-rls-live.mjs --self-test
TSX_DISABLE_CACHE=1 ./node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test tests/unit/student-loan*.test.ts tests/unit/student-loan*.test.tsx
```

Live harnesses require the serialized database lease, an exact client baseline and an explicit execution flag. They must retain uncertain-operation ledgers and verify fixture removal and protected-owner preservation before another live run. Do not infer live acceptance from the offline counts.
