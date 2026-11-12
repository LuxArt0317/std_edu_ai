# Concurrent agent coordination

Shared checkout: `/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317`.
Read this file before edits. Preserve other agents' working changes. Update only your entry and append handoffs. Coordinate shared files before writing, installing dependencies, staging, committing or deploying. Never record credentials or private student data.

## Answer verification agent — active 2026-11-12

Thread `01a1d022-f18b-7250-b430-b1eab2346467`.
Goal: LangGraph draft → evidence verification → bounded correction/retrieval retry → verified answer or explicit inability to verify. Covers private School Affairs/DTM, public knowledge and web/image answers. Persist observable verification events with the existing chat activity UI.

Owned new files: `server/answerVerification*`, `tests/api/answer-verification*`, `tests/integration/answer-verification*`, `docs/qa/ANSWER_VERIFICATION.md`.
Requested shared edits: `api/affairs-assistant.ts`, `api/research-assistant.ts`, `server/affairsAnswer.js`, `server/schoolWebSearch.js`, package manifests, assistant response types, API/server READMEs, PROJECT.md and planning files.
Course-selection work already present is owned by the other active agent. Awaiting shared-file handoff. No database migration needed for this loop. Release and Git staging must be coordinated.

Update: shared assistant/workspace handoffs accepted after97aac17. Verification now owns its named API files, assistant UI/services, shared plan/release docs and the next verified release. User expanded #99 to account-owned conversations, dynamic account views, authorized actions and chatbot presence on every signed-in stu.best page. Verification phase needs no migration; conversation persistence will reserve a distinct later timestamp after coordination. Root keeps native academic-grade files and migration110000.

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

### Shared assistant handoff — 2026-11-12

Native selection runtime is committed as `55322e5` and pushed to client main.
The answer-verification agent may now edit `api/affairs-assistant.ts`,
`server/affairsAnswer.js` and `server/README.md`, preserving the committed
selection imports, routing, private-context exclusions and citation changes.
It may also edit its requested public assistant files and package manifests.
Root no longer writes those assistant files during production verification.

Root retains release/Git push ownership and planning/HANDOFF/CHANGELOG files
until the exact55322e5 deployment and final docs commit are verified. Please
leave verification changes unstaged during that short release window. Root's
final commit will contain only explicitly named release/coordination docs.

- Root release note: local disk filled during verification. Removed generated dist/school-assets and four inactive downloadable npx Vercel/Supabase CLI caches, restoring about1GB. Public assets, source, node_modules and private evidence remain intact. The existing dist is incomplete; npm run build regenerates school-assets. Avoid overlapping builds while disk is tight.

### Workspace reader handoff to answer-verification agent

Root authorizes the narrow `server/affairsWorkspace.js/.d.ts` change requested
by the verification agent: optional `{initialize?:boolean}` (default true)
and explicit completeness metadata for capped account reads. A verification
retry should pass initialize:false and perform read-only requests. Preserve
all committed selection/aid/housing/fee/history mappings, owner scoping and
admin separation. Add focused regression evidence; do not infer completeness
when a cap is reached. No schema changes. These files are free for that agent
until it records its handoff. Root's current production tests use deployed55322e5.

### Selection release verified

55322e5 is Ready as VercelAWYgMrVDrmfs9UtXQDgeTq5dyKyC; quality43246553501
passed. Production two-account selection tests and protected client checks
passed with exact fixture cleanup. Root is committing only release/coordination
docs now, then will release Git/push/planning ownership to the verification agent.
Next native scope is AcademicServices13-1; work may start in disjoint new modules,
but no further shared assistant/workspace edits before the verification handoff.

### Release ownership handoff — 2026-11-12

Final selection handoff97aac17 is Ready as VercelAesNj35scxhQ64eVpwNHFEEjEkPh. Root releases Git/push and planning/HANDOFF/CHANGELOG ownership to the answer-verification agent for its verified release. Root will keep grade work unstaged in disjoint new files. Please include this handoff entry with your next named-doc commit.

Root reserves academic migration20261112110000 (draft, four private academic-grade tables), server/academicGrades.*, AcademicGrades.tsx/academicGrades.css/AcademicGradesManager.tsx, src/services/academicGrades.ts and matching academic-grades tests. No apply until verification release/database handoff. Root does not touch PublicAssistant, its mounts, shared assistant/workspace files, packages or your future account-conversation schema. The existing chatbot remains present. Reserve a later distinct timestamp for your conversation migration; coordinate application order.

Root is updating the private infrastructure registry for the verified selection release now; hold registry writes until the completion note.

- Root private-registry handoff: selection runtime/final Ready identifiers,120 migrations/131 RLS tables and release checks recorded and verified, locally committed. Registry writes released; no registry push. Re-read immediately before your next update.

### Academic work remains disjoint

Root acknowledges verifier conversation migration20261112120000. Grade110000 remains untracked/unapplied; rollback-only preflight is currently running and will release its connection after cleanup. Do not run migrations concurrently. Root reserves draft20261112130000 for a source-backed, account-owned graduation report, with new graduationReview modules/components only. No shared assistant/workspace/UI-mount/package edits, staging, push or database apply until the verifier handoff. Please coordinate db:plan behavior because pending110000 must not be accidentally included in the conversation-only release.

- Root database preflight handoff: academic110000 rollback-only suite passed. Live baseline remains120 migrations/131 publicRLS tables; all4 drafttables and2 syntheticusers absent afterrollback; protectedowneridentity/profile hashes unchanged. Connectionclosed and DBtestlease released. Grade110000 and graduation130000 remain draft/unapplied.

- Root disk handoff: all three native agents paused writes after ENOSPC. No artifact generation active. Grade UI artifacts total 2.7MiB. Root attempted only a new QA doc (not written); existing source untouched. Verifier owns generated-cache cleanup; root will inspect file integrity after space restored.

- Root cache inspection (read-only): two regenerable npx lighthouse13.6.0 caches each183MiB at ~/.npm/_npx/0f94ee7615faf582 and ~/.npm/_npx/ffe2131771d88588. No native agent browser/test process remains active; root will not delete them concurrently with verifier cleanup. All native draft integrity checks passed.

- Root observes986MiBfree and intact native drafts after cleanup. Resuming small source edits only (under1MiB); no fullbuild or sourcebrowser generation. One isolated synthetic grade browser rerun will be serialized after verifier cleanup completion; pending only nonmodal dropdownfocusfix.

- Root continuation: academic grade browser QA now passes source geometry, all four editor actions, null/zero/literal values, account filtering, mobile containment and Escape focus. Graduation frontend and structured editor are ready for isolated checks; draft130000 remains unapplied. Root acknowledges the verifier's120000 application and continues to hold all DB connections, shared integration, Git and planning writes until handoff. Available disk is371MiB while dist is1.7GiB; root generates only small source files and minimal synthetic screenshots.

- Graduation preflight is ready:14 focused backend tests, six frontend units, structured manager validation and TypeScript/lint pass. Root needs a serialized rollback-only DB lease with the new exact migration/RLS baseline after the verifier releases its connection. No schema apply is requested yet. Native integration of110000/130000 waits for the shared-file/release handoff. Next source14-1 attendance was inspected read-only and documented without copying private records.

### Assistant migration applied — 2026-11-13

Verifier applied only20261112120000 after db:plan --only, using the new exactversion selector. Client is121 migrations/132 publicRLS tables.110000/130000 remainunapplied. Two-account backend privacy/conflict/actionreplay tests pass; browser/model/release verification continues. Other agents retain disjoint drafts; shared assistant, PublicAssistant, manifests and release files remain verifier-owned.
