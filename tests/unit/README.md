# unit

School-account route tests cover the removed personal summary, its compatibility redirect, separately verified admin access, and the moved manager's caller-bound mutations. These use offline identities and transport fixtures; they do not alter database roles or test university sign-in.

Pending-fee unit checks cover cent arithmetic, unsettled-row filtering, nullable occurrence dates and safe table output. Credit-load-history checks cover the observed six-column output and display helpers.

Course-selection checks cover own-account phase filtering, source year/semester defaults, the fourteen-period schedule and safe display. Manager checks cover create/edit payloads, immutable ownership, explicit slot inclusion, stable retry IDs and conflict recovery without replacing unsaved edits.
## Native academic components

Academic grades, attendance and modern/legacy graduation suites verify record filtering, literal null/zero values, manager validation, stable retry IDs and disclosure controls. Source geometry and real database/browser checks live in [integration tests](../integration/README.md).

The DTM submission suites cover detail/editor state, pending versus saved files, revision reviews, manager mounts, maintenance and account switches. Certificate suites cover personal/admin transports, blocked/unknown display, retained conflict drafts and identity cancellation. Live database/browser acceptance is separate.

Assistant session hook/storage/isolation tests cover per-chat failures, saving after refresh, switching accounts during pending saves, retained observable activity and truthful unsaved UI. They do not establish provider/model acceptance.

`student-loan*.test.ts(x)` covers source view states, transport/session boundaries, preserved drafts/retries, conflicts and mounted local routes. [Student Loan QA](../../docs/qa/STUDENT_LOAN.md).

`dorm-conduct` and `dormitory-conduct*` tests cover the source notice, strict transports, identity cancellation, uncertain retries, conflict drafts and mounted personal/admin routes. See [Dormitory Conduct QA](../../docs/qa/DORMITORY_CONDUCT.md).

`dtm-dashboard-layout.test.tsx` checks observed block configuration, owner-keyed state, save/reset/retry/conflict behavior and transport cancellation. Source geometry and live persistence require separate browser checks.

`education-fund.test.tsx` verifies captured closed-period instructions and local links; `student-service-aliases.test.tsx` exercises exact legacy routes, history replacement and unknown-path handling. `student-service-mutation-isolation.test.tsx` runs42 actual-transport DOM cases with synthetic session/fetch responses covering account switches, late completion, duplicates and unchanged retries. These are offline checks, not database acceptance.

`credit-load-application.test.tsx` covers the captured closed-period entry and system-index local destinations without authentication, API or database calls.

`dtm-grade-report*.test.ts[x]`, `dtm-course-grade-report.test.tsx` and `dtm-grade-overview.test.tsx` cover literal rendering, account-bound transport, admin drafts/retries, deferred anchors, pagination beyond 1,000 courses and account/permission changes. Fixtures are synthetic; these are not live persistence evidence.

`dtm-course-assignment.test.tsx` checks exact assignment reads, immediate identity/route clearing, stale completion aborts, missing records and retry without depending on the generic workspace assignment page. Course content client/renderer/manager tests cover consistent paging and draft retention.
