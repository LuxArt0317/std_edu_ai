# Concurrent agent coordination

Shared checkout: `/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317`.
Read this file before edits. Preserve other agents' working changes. Update only your entry and append handoffs. Coordinate shared files before writing, installing dependencies, staging, committing or deploying. Never record credentials or private student data.

## Answer verification agent — active 2026-11-12

Thread `01a1d022-f18b-7250-b430-b1eab2346467`.
Goal: LangGraph draft → evidence verification → bounded correction/retrieval retry → verified answer or explicit inability to verify. Covers private School Affairs/DTM, public knowledge and web/image answers. Persist observable verification events with the existing chat activity UI.

Owned new files: `server/answerVerification*`, `tests/api/answer-verification*`, `tests/integration/answer-verification*`, `docs/qa/ANSWER_VERIFICATION.md`.
Requested shared edits: `api/affairs-assistant.ts`, `api/research-assistant.ts`, `server/affairsAnswer.js`, `server/schoolWebSearch.js`, package manifests, assistant response types, API/server READMEs, PROJECT.md and planning files.
Course-selection work already present is owned by the other active agent. Awaiting shared-file handoff. No database migration needed for this loop. Release and Git staging must be coordinated.

## Handoffs

- 2026-11-12: Identified active course-selection work in the shared checkout. New verification modules can proceed independently while endpoint edits are coordinated.

## Protected-page agent — active 2026-11-12

Thread `01a19759-4223-7662-80b8-e27138ed87f3`, Codex root. Issue #98.
Current batch: native selection history `11-1` and weekly timetable `11-2`,
source layouts plus private phase records, manager writes and grounded answers.

**Shared-file hold:** `api/affairs-assistant.ts`, `server/affairsAnswer.js`,
`server/README.md` and planning files are stable but reserved until the imminent
course-selection runtime commit is recorded below. Please build verification
modules independently meanwhile. Root will commit only named selection files;
package manifests and verification files belong to the answer-verification agent.
Do not stage or commit selection changes. No blanket `git add`.

Owned modules: `server/courseSelection.*`, selection migration1000, selection
API/unit/integration tests, `CourseSelection*`, `courseSelection.css`,
`src/services/courseSelection.ts`, `affairsWorkspace`, `schoolAffairsDirectory`,
portal/PublicSite/record-manager wiring and current release documentation.
Subagents `dtm_course_layout` and `protected_service_audit` are frozen; the
`scholarship_workflow` subagent is completing the real database QA harness.

Migration `20261112100000_course_selection_history.sql` is already applied to
client `xiftudmvxphxcjtmfmib`: 120 migrations / 131 public RLS tables. Do not
edit applied SQL or reset the database. Source school sessions are read-only;
private screenshots and school records stay outside Git.

This agent is the current release/database owner. Hold Git pushes and database
operations until the release handoff is recorded. The single task plan remains
`planning-with-files/task_plan.md`; this ledger records concurrent ownership only.

- 2026-11-12: Consolidated coordination into this `agent/A2A.md` after discovering
  the answer-verification agent's entry. No duplicate coordination ledger remains.
