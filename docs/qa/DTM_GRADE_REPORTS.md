# Moodle grade reports — Issue #98

## Scope

A separate account/course-owned report preserves the observed eight display columns, ordered assessment rows, optional weight notes, and an explicit optional course total. The overview has only course name and the saved total grade. `/dtm/course/:id/grades/overview` retains the owned course heading, breadcrumb, sidebar and tabs; `/dtm/grades` remains a global overview. Unmapped numeric source IDs never select a local course by guesswork. `null` displays an ASCII dash, a blank string stays blank and `"0"` stays zero. Numeric metadata is never used to infer percentages, ranges, weights, ranks or totals.

Reports are administrator-maintained local records. They do not synchronize university grades. The existing personal numeric tracker, its edit flow and `#grade-UUID` links remain available through the course menu. Report anchors are `#report-item-UUID`. Source screenshots and private source cell text stay in ignored artifacts, not version control. No source personal grades are seeded by this migration.

## Authorization and persistence

Migration `20261114000000_dtm_grade_reports.sql` adds public `dtm_grade_reports` plus private operation receipts. RLS requires the verified Google identity and restricts student reads to their owner. Administrator reads use a narrow course metadata RPC for the selected student; legacy personal-course RLS is unchanged. Maintenance is versioned, audited and idempotent by actor/request ID. Deleted report IDs cannot be reused; course/account deletion cascades. One active report per course is enforced in the database.

Read and write adapters use only the verified caller token, strict query/envelope allowlists, a shared request deadline and bounded JSON. UI clients discard stale account responses. The editor retains drafts across conflicts and uncertain outcomes, replays the same operation, and separates acknowledgment from a successful reread. Whole-report content is capped at 500 items and 131072 JSONB bytes; responses at 196608 bytes. Course metadata preserves legacy literal strings. Overview/admin lists load 100 courses per cursor page; failed later pages never imply completeness.

## Checks and current status

- Exact client plan started at 133 migrations / 150 public RLS tables with only this migration pending. After the five-group rollback preflight, only `20261114000000` was applied. Independent SQL confirmed 134 migrations / 151 public RLS tables and exact migration-source equality; initial reports and receipts were both zero.
- Isolated API/source suite: 965 passed. Initial complete unit suite: 483 passed. After adding eight context cases the parallel suite reported 490/491 on an existing assistant-session cache timing assertion. That file passed7/7 in isolation; the full suite passed491/491 with concurrency1. Both original and successful logs are retained. TypeScript/build/assets passed; lint has existing warnings. Contextual overview navigation passed38 focused/neighbor DOM cases.
- Rollback preflight passed all five groups using four synthetic accounts, 104 courses and eight successful operations. It restored schema/history/legacy grades/owner identity, left no fixtures and closed its reserved connection.
- Compiled browser acceptance passed eight groups at 1533, 768, 390 and 320 pixels: literal cells, explicit-only totals, stale account reads, safe retries, legacy links, pagination and guest gates. No unexpected requests, page errors or document overflow. Both table rectangles differed from the captured 1280px source viewport by at most 0.03125 CSS pixels. Evidence: ignored `artifacts/dtm-grade-report-ui/2026-11-13T11-30-23.024Z/`.
- Actual-JWT persistence acceptance passed four groups, 44 actual-handler requests and eight successful writes using three synthetic identities and103 courses. Exact cleanup, owner/legacy preservation and closed connection verified; evidence `artifacts/dtm-grade-report-http/local-6ccdc499-cc47-4ac6-b896-f5c76dad3f32/result.json`. The first attempt stopped before any API calls because its synthetic Google identity lacked timestamps required by Auth. Exact-ID recovery repaired only that fixture, deleted it, proved owner preservation and fixture absence, and closed its connection. Original failed evidence remains under ignored `artifacts/dtm-grade-report-http/local-db127d5a-30a5-4a87-93f9-686962d0792f/`; the corrected harness initializes all three timestamps and passes nine offline groups. The recovered run remains failed rather than being relabeled successful.
- Release gates: handoff links/target checks, client verification and dependency audit passed (zero reported vulnerabilities). The standard client command included one non-mutating authenticated `/api/school-assistant` provider health request; no Issue100 model/evaluator suite was run and its 66 file fingerprints remain unchanged. Further AI checks remain paused.
- Publication: pending; accepted production remains 53c9304.

Source inspection confirmed eight per-course columns and the two-column overview in an authorized session without school mutations. Captures live under ignored `artifacts/visual-parity/dtm-grade-report-source/`. The table geometry comparison does not establish complete page or private-content pixel parity. No official personal grades were imported.

## Reproduction

From the client checkout:

```sh
node --experimental-strip-types --test tests/api/dtm-grade-report*.test.ts
node_modules/.bin/tsx --tsconfig tsconfig.unit.json --test tests/unit/dtm-grade-report*.test.ts tests/unit/dtm-grade-report*.test.tsx tests/unit/dtm-course-grade-report.test.tsx tests/unit/dtm-grade-overview.test.tsx
node tests/integration/dtm-grade-report-rls-live.mjs --self-test
npm run db:plan -- --only=20261114000000
```

The preflight `--execute --preflight --expected-migrations=133 --expected-rls=150` requires the exact unchanged baseline and the serialized root database lease. It installs draft DDL and synthetic fixtures in one reserved transaction, then rolls back and checks schema/history/legacy grades/owner identity and fixture absence. Do not run after application or change its expected baseline to bypass that guard.

## Remaining boundaries

Generic assistant snapshots and dedicated assistant tools are unchanged while Issue #100 is user-paused. New report cells are not yet supplied to that assistant. Nested grade categories, university synchronization, source-hidden forms and full protected-system parity remain separate work. Issue #98 remains open.
