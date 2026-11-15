# Graduation clearance

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [Application](https://stu.best/school-affairs/services/10-1) · [Status](https://stu.best/school-affairs/services/16-1)

The university's flowchart documents an explicit decision to proceed after reading the notice, individual office results, and clearing outstanding items before collecting a certificate. Both current authenticated screens led to university sign-in. The application and status layouts are local implementations of the published workflow. Historical dates were excluded from the database. [University procedure](https://www.aca.stu.edu.tw/%E7%94%B3%E8%AB%8B%E7%95%A2%E6%A5%AD%E9%9B%A2%E6%A0%A1%E8%88%87%E9%A0%98%E5%8F%96%E5%AD%B8%E4%BD%8D%E8%AD%89%E6%9B%B8%E6%93%8D%E4%BD%9C%E6%B5%81%E7%A8%8B/) · [Academic Affairs FAQ](https://www.aca.stu.edu.tw/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C%EF%BD%9Cqa/)

- School Affairs administration assigns terms, application windows and candidate tracks. A student explicitly confirms one application per assigned term while the window is open. The server snapshots the applicable offices when it saves the application. Graduate applicants receive advisor and thesis review rows. The international review is configurable per candidate.
- The status page shows each office's decision, note and update time. The site administrator can record, correct or reopen an office decision. Changing an office decision requires its current version, and repeated confirmations use the original request ID. The saved review rows and receipts remain associated with the authenticated account. The student status page and assistant read the same decisions. The assistant shows statuses and leaves detailed notes in the portal.
- Migration 20261114150000 adds four RLS-protected public tables and private receipts. It seeds no applicant, period, or result. The service does not change university academic status, issue certificates, dispatch unit notifications, or implement the graduate paper workflow. Unit-specific staff sign-in and the career survey remain outside this release. Exact authenticated form and status layout comparison remains open.

## Verification

- `node --test tests/evaluation/clearance-owned-packet.test.mjs` replays frozen questions through both School Affairs routes with two synthetic signed-in callers. It checks application-window and office-note scope, the empty account, denied assistant and native actions, and unchanged records before and after requests.
- `node tests/integration/graduation-clearance-db.mjs --rollback-preflight` exercises the migration against the exact client schema and rolls all successful writes back. Use `--deployed` to test the installed schema. It covers manager-only actions, confirmed submission, appropriate offices, retries, stale writes and isolation.
- `node --experimental-strip-types tests/integration/graduation-clearance-http.mjs --verify-client` exercises real Supabase sessions, exact fixture cleanup, and bilingual assistant status. Set `EXPECTED_RELEASE_REVISION` for the production handlers.
- `node tests/integration/graduation-clearance-ui.mjs` exercises compiled navigation, acknowledgement, retry, administrator edits, saved status on reload, responsive rendering and the guest return. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` for the deployed bundle. The browser uses intercepted data, while the HTTP and rollback suites exercise persistence.

## Protected status evaluation

Run from the exact clean revision deployed to the approved protected Preview. Supply the reviewed newest and earlier existing term IDs. The runner checks their order, full shared-row fingerprint, and absence of configured periods for the selected terms before creating disposable callers.

```sh
node tests/evaluation/run-clearance-status-preview.mjs APPROVED_PREVIEW_ORIGIN FULL_SOURCE_REVISION NEWER_TERM_ID OLDER_TERM_ID
```

The 16-case status packet compares both callers' native page responses with independent SQL snapshots. It grades visible office statuses, authorized notes, empty results, navigation, and access and action denials. It pins all 80 application requests and verifies cleanup of the disposable accounts, profiles, applications and review rows. It records the three positive window questions as deferred pending approved period bindings. The redacted report records the request coverage and shared-row digest.

## Deployed evidence

Production `e2671d6` is live as Vercel `7KsgCHrcNw7uXurhYpeFh4ecHtFF`. Only migration 20261114150000 was applied, bringing the client to 149 migrations and 173 RLS-protected public tables. The revision-pinned browser, 19 authenticated HTTP checks with student writes, replay and exact cleanup, two guest assistant sign-in returns, and eight public shell routes passed. Quality 43507889134 passed. The 94-destination local navigation inventory has 39 generic and 17 partial entries. Successful administrator changes and scope denial were verified by the exact-target rollback. The production browser used fixtures.
