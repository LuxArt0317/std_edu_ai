# Current state — 25 November 2026

## Checkout and release

- Active client checkout: `std_edu_ai-release-20261125`, branch `codex/release-handoff-20261125`, remote `LuxArt0317/std_edu_ai`. Original repository untouched.
- Last verified published release: `61e7b02889124f84b3b5fe4da0e75b99a06633c8`, Git-built deployment `dpl_4JpJ8m2SQnKiKdmqDiVsk2TWHugs`, promoted to stu.best after PR103. Later changes remain local.
- Release acceptance: exact-tree Quality45561021731 backend/browser passed; live public routes/assets checked. This does not establish current private-question acceptance.

## Goal remains open

All53 cases must reach70 with natural, grounded answers. Luna produces test answers; Terra6.1 grades independently. Do not substitute historical best scores or fixture tests for current acceptance. Work one question at a time; preserve failures and avoid regenerating already completed answers for grading outages. Unchanged prepared guides are excluded from regression.

## Completed baseline regression

- Label: `retrieval-regression-20261125`, source checkpoint f89ace7f, API-only public research, serial24cases. Exec76511 is TERMINAL; do not poll/restart it.
- Terminal baseline:15passed,6below70 (Q09=20,Q20=25,Q30=20,Q36=65,Q43=65,Q44=20),3ungraded (Q06,Q52,Q53) because grader transport timed out.
- Q04/Q45 had already passed fresh85/90 and were not repeated. Baseline used the old cached backend and v1 grader; later patches did not contaminate it.
- Private run artifacts and exact source checkpoint: `.evaluation-lab/bank-runs/retrieval-regression-20261125/`.

## Grade-only recovery after server reload

- Q06 existing answer:80, Terra6.1/public-source-context-v2.
- Q36 identical existing answer:90 with corrected native catalog evidence; old65 retained in history.
- Q53 existing answer:75.
- Q52 existing answer passed75 after the confirmed15s-versus30s grading-timeout fix. All baseline answers are now graded:19pass/5below. The grade-only fix preserved the answer and earlier history.
- Recovery receipt: `.evaluation-lab/diagnostics/regression-grade-recovery-20261125.json`. Exec51219 TERMINAL.
- Local store:53cases/315runs at last read; last cloud merge287runs/rev116. New local results have NOT been uploaded/deployed.

## Local fixes and verification

- f8b512d3: focus-only rejected drafts retain validated missing-detail labels as untrusted repair hints, not facts or a pass. Public reviewer interruption can recheck the same draft/evidence once with25seconds remaining, existing limits, no proposed action and no reread/rewrite.
- Public grader v2 prefers the current native contact catalog over its obsolete imported404 capture. Five contact rows are checked against registered hashes, literal source lines and field values. Rubric/weights/reference/70target unchanged; historical grades retained.
-29core/provider/graph checks and13grader-context checks passed. Provider timeout follow-up adds one further passing check. API types/runtime-import lint293/0 passed; JavaScript-only hosted dispatch packaging passed with0provider calls/3fixtures.
- UI lint:0errors/5warnings on unchanged hook/export/unused-variable code. No new rendered-browser claim.
- Earlier local private fixes: Q03 current-caller charge grading; Q12 leave-count units/date/status clarification and current-caller leave grading; Q05 page-backed scholarship navigation/history/status evidence; Q15 real curriculum-plan navigation and current/legacy report guide. Private grading source adapters currently support Q03/Q12 only.
- Q05/Q12/Q15 fixes passed focused contracts but still require real signed-in model evaluation. No universal graduation credits, inferred cohort, award/payment, attendance or approval claims added.

## Next actions

1. Q09 repair is loaded and accepted; local server currently exec40598 serves the latest f24c0a18 source and local audit-effort configuration. Do not restart during an active model/grade process.
2. Stop tuning Q09: latest fresh run scored95, verified2checks,46.5s producer. Continue Q20 next. The first post-feedback HTTP run still failed20 from two checker timeouts. Current-code first-review diagnostic supported15claims but rejected coverage: applicant scope, programme-versus-award obligations, and suspension/withdrawal repayment. Diagnostic intentionally blocked later calls and is not acceptance.
3. Continue Q20,Q30,Q43,Q44 one at a time. Q43 omitted published club social links; confirm the actual source projection before changing it. Q30/Q44 failed review timeouts; Q09 focus-only coverage feedback was previously dropped.
4. Complete real signed-in acceptance for the12private cases. Nine have historical authenticated production answers; Q17/Q27/Q49 have no saved private answer. Do not export browser tokens or impersonate the user. Dedicated Codex computer controls remain unavailable; no desktop/headless browser fallback is authorized.
5. After the next behavior batch, regress prior retrieval cases as required; skip unchanged prepared guidance and do not repeatedly retune scores already at70.

## Boundaries and handoff

No new deployment, provider configuration, database/schema change or account-role expansion occurred in this local follow-up. Real private acceptance remains unproven. Missing Q50 registration leaves were added to existing P0Issue102 without fabricating working forms. Keep the goal active.

## Latest Q09 diagnostic/configuration
The first diagnostic resolved through the private-store symlink into the preserved old checkout. It was stopped and its trace explicitly renamed wrong-checkout-aborted; no scored run affected. Corrected diagnostic imports absolute current-checkout modules and completed the first review in38s. New neutral response-needs notes follow its source-backed gaps without inserting expected-answer values. OptionalOPENAI_VERIFICATION_REASONING_EFFORTkeepsunsetbehaviorunchanged;localignored.env.localnowsetslowfortheTerra6.1sourceauditoronly.AnswerLuna/mediumandgraderTerra6.1/mediumunchanged.12focusedsource/providercheckspassed;APItypes/lintpassedbeforefinalwording-onlyedit.Newcombinedconfigurationawaitsfreshmodelacceptance.

## Latest accepted Q09
Freshlabelq09-scope-audit-effort-20261125onf24c0a18scored95withLuna/mediumanswerandTerra6.1/mediumgrading;Terra6.1sourceauditorusedlocalloweffort.Answerverifiedafteronefocusedcorrection(2checks),46.5sproducer.Runandsource/configcheckpointstoredprivately;notbrowser/private/productionacceptance.Exec10675TERMINAL.StopQ09tuning.Fourretrievalcasesremainbelowtarget:Q20,Q30,Q43,Q44;private12casegatealsoremainsopen.Passinglatestresultsspanrecordedcheckpoints,notuniformlatest-codeacceptance.Newserverexec40598isactive;nopaidmodelrunactiveatthischeckpoint.

## Q20/Q30/Q44 acceptance and next Q43
FreshLuna/mediumanswerswithTerra6.1/mediumgradingpassedQ20=75(25.5s,verified1),Q30=80(41.1s,verified2),Q44=90(21.9s,verificationstoredinrun).Stopretuningthesecases.Latestsavedretrievalresults23/24meet70acrossrecordedcheckpoints;Q43remains.Fulluniformlatest-runtimeregressionstillneeded.ParallelreviewedlocalpatchesretainactualQ43InstagramcontactsandaddboundedQ16mixedcourse-planningintent.9rootfocusedchecksand16agentplanning/coachingchecks/types/lintpass;privateQ16modelacceptanceunproven.AuthquestionpendingforQ12browserrun.Nopaidmodelprocessactive;server40598stillcachespre-club/pre-planningmodules.Reloadonlyafternamedcommit/packagingcheck.

## Signed-in/public routing parity repair
Offlineactualauthenticated-handlerauditof41publicFAQquestionsfound7wrongprivate-snapshotselections(Q20,Q25,Q32,Q34,Q36,Q50,Q51).NewpublicSignedInDispatch.jsreusessharedpublicsourcepredicatesbeforeaccountselection,withqualifiedown/foreign-record/writeexclusionsandregisteredpublicroutesonly.Noauth/historyforwarding.22focuseddispatchchecks,types/importlintandthe41caseauditnowpasswith0privateselections/errors.Thisisroutingfixtureproof,notrealsigned-inbrowser/modelacceptance.Club/Q16patchiscommitted0ff1e623;routingpatchawaitscommit/reload.Q43lastpublicretrievalcaseawaitsitsonefreshmodeltest;privateQ12authquestionpending.

## Current checkpoint superseding earlier runtime notes
Local HEAD044bd644 serves on exec50855. Q43 passed100; Q09/Q20/Q30/Q44 passed95/75/80/90. The19-case post-repair regression exec76837 remains live, with16 cases passed70–100 through Q50 and Q51 started. New Q13 grading adapter uses the existing caller-owned timetable reader; complete/owner/cap/deadline checks and unlinked uncertainty are enforced. Real private acceptance remains pending the user’s Codex sign-in/run. No new deployment or cloud data sync.

## Terminal post-repair regression
Exec76837 completed19/19 at70orhigher, zero below-target/ungraded/errors. Exact results remain in .evaluation-lab/bank-runs/retrieval-regression-post-repair-20261125/summary.json; ledger reconciled preserving history. Together with five recent repaired-case passes, all24 public retrieval questions pass under the updated flow/configuration. Unchanged prepared guides were excluded. Private12-case real-session acceptance remains open. Q13 committed304821b7; types,9focused checks,294-file import lint and JS-only packaging pass. Local server50855 still caches044bd644; reload before Q13 grading. No deployment/cloud sync.

## Q17 next local repair
Audit found unspecified-term subject questions fell through exact course-history selection. Added bounded bilingual missing-term navigation clarification before account reads, linking existing11-1/11-2 pages. Explicit terms, follow-ups, compounds, writes, images and other owners retain their existing paths. This prepared guide was not paid-regressed per user policy; real private evaluation remains pending. No deployment.

Runtime reloaded after terminal regression: local exec68713 now serves0f5b17c7, including Q13 grading and Q17 clarification. Login route returned HTTP200.

## Q18 compound evidence repair
The exact Q18 initially matched grades but not graduation because the other-topic guard rejected its grade clause. Added bounded bilingual first-person compound intent selecting academicGrades and graduationReview as mixed guidance and allowing the independent graduation report predicate. Existing transcript/rank multi-scope clarification remains; no eligibility or future rank derived from grades. Focused intent/boundary checks, existing academic/grade/planning contracts, types and runtime lint pass. Real signed-in model acceptance remains unverified. Server68713 still caches pre-Q18 modules; reload before testing. No deployment/cloud sync.

Runtime superseding prior note: exec48696 now serves91d42cff with Q18 loaded; login route verified200. No paid model job is active.

## Full 53-case acceptance audit
Latest exact-version graded runs:41public cases >=70,1private case >=70 historically,11private below/ungraded/missing. This is not fresh53-case acceptance. The24public retrieval cases have recent Luna/Terra passes;17prepared/public guides retain prior graded passes under the no-regression policy. Q01/Q28/Q33 have later failed/ungraded attempts, recorded separately rather than erased by historical passes. Q01 later failure was the already repaired production TypeScript import issue; no answer existed to grade. The private state still has no new signed-in runs after06:55Z.
Q22 assignment-list selector correctly chooses open rows with deadlines/statuses; saved85pass retained and not retuned. Q27 selects the academic-services graduation report; no invented activity-deficit source added. Private detailed audit saved in ignored diagnostics/goal-completion-audit-20261125.json with latestAttempt/latestGraded separated. Codex tools still expose open_in_codex only, no browser control; real user-session acceptance cannot be executed by this chat.

## Private acceptance blocked audit
The same real-session gate persists across at least three consecutive goal turns. Rechecked local state:338total runs,18private runs, latest private run2026-11-25T06:55:11.786Z; no fresh private acceptance. Login endpoint returns200, so server availability is not the blocker. Available Codex tools expose open_in_codex but no computer/browser controls. Existing pending user request asks for real sign-in and a Q12 run. No token export, impersonation, desktop/headless fallback or fabricated acceptance is authorized. Further targeted behavior tuning requires actual current private failures; speculative edits and additional public paid tests are not justified. Mark goal blocked, not complete, until the user supplies a signed-in lab run or supported browser controls become available. Local server48696 remains available.


## Issue #104 local API tools checkpoint
Automatic API discovery and reviewed invocation are implemented locally in the release checkout. Fourteen catalog routes include aliases; nine are callable, with recursive control endpoints excluded. Sixteen focused tests, TypeScript and JS-only packaging passed. Local HTTP5173 responds200, but Codex browser connection failures prevent signed-in UI/model acceptance. Hosted migration is prepared but NOT applied; production flag remains unchanged.

## Issue #105 local repair
Guest personal intent now gates before public shortcuts, with sign-in-only activity. Public paraphrases can use semantic retrieval wording while composition retains the original question. Private dispatch revalidates its session. Focused tests, live intent checks, types/import/packaging checks pass. Local5173 restarted; no production deployment. Signed-in browser acceptance remains unverified.

## Issue #106
Fixed local API-preflight interruption: established grade intents bypass the generic loop; failed verification falls back instead of becoming a final generic response. Added focused academic-grades API contract and corrected DTM selector guidance. Activity no longer displays raw API paths/status.28focused tests pass with full types/import/catalog/JS-only packaging. Local server restarted; no deployment or production data mutation. Signed-in browser acceptance remains unverified.

## Issue #107
Codex browser confirmed a restored session for the user account, not anonymous private retrieval. Added visible verified email and Sign out. Browser sign-out succeeded, private chats disappeared, and anonymous “what are my grades” returned only the login handoff. Academic grade-only planning/read/evidence now excludes practice and DTM substitution. Concise sample provenance remains; ordinary stored records get no blanket unofficial disclaimer. Local server62707 running; production unchanged.

## Issue #108 unified discovery — local
Implemented shared LangGraph planning/tool/verification flow for guest website search and authenticated API discovery. Public index842chunks/491destinations, all842vectors cached. Public-only hybrid retrieval, full bounded document reads and indexed-link following; no expected answers or private rows indexed. Planner Terra is independent of selected final-answer model. Live calendar discovery and unseen commencement paraphrase passed with source verification; anonymous forged identity returned sign-in only. Existing specialized paths remain fallback. Local flags enabled; restart running on5173. Production unchanged; signed-in live model acceptance remains outstanding.

Final Issue108 endpoint checks: unseen stage/commencement phrasing returned June12,2027 with website search/read/composition/source-check activity; laptop-online phrasing returned source-backed campus Wi-Fi setup without a Wi-Fi keyword. Both independently verified. Forged-account anonymous grades request returned authentication-only handoff. Final planner uses Terra; final answer remains selected model.

## Issue #109
Implemented API-operation/scope completion review and read-only alternate-source recovery. Added owned released-assessments API scope for existing stored quiz items; no seed or DB mutation. Signed-in Codex browser returned the stored assessment value rather than link-only handoff. Transcript was empty; DTM overview total blank and detail report unavailable. Compact generic API composition/audit retains exact-reference checks.36focused tests +18existing verifier/native regressions pass; full types/import/JS-only packaging pass. Local backend restarted; production untouched.

## Issue #110 — local Moodle import in progress
Canonical release checkout remains active. Private local SQLite has47courses,114pages,694activities,366literal table rows;47pages are user-grade reports and20areactivitydetails. Own imported navigation/course/grade overview and shared authenticated dtm-library API implemented.661linkedactivities and external files/embedded media/threads remain uncopied. Codex browser transport disconnected, including recovery attempts, so final rendered UI acceptance is not claimed. Local tests verify persistence/isolation/hosted disablement; types and import/packaging checks pass. No push/deploy or production DB mutation. Source captures stay outside Git. Resume via signed-in /dtm/import database-derived queue when Codex browser reconnects.

Final local verification: SQLite integrity_check=ok and mode600; /dtm HTTP200; anonymous dtm-library HTTP401. Server restarted with updated handlers at127.0.0.1:5173 (exec session53011). Two focused SQLite/security tests, API/full types,319-file runtime lint,14-route API catalog lint and JS-only hosted packaging pass. Final original-versus-local rendered parity remains blocked by browser transport.

## Issue #111 — imported Moodle score reader
Connected the established DTM grade evidence path to owner-scoped imported reports, alongside semantic API discovery guidance. Normal library reads exclude661pendingcapturelinks; explicit view=coverage retains import administration. Overview includes literal total/range/percentage/rank and local URLs. Existing native UUID routes retain their source. Imported composition now uses a compact record prompt with35second/6000token bounds; independent audit remains.33focusedtests,full/APItypes,320file runtime lint,14route catalog lint and JS-only packaging pass. Actual47course source projection is13530bytes. First live Sol composition timed out under old15second cap; after correction, liveGPT6.1Sol composition answered2219characters and independentverificationreturnedok=true. This was source-to-model acceptance, not a full signed-in browser chat replay. Local server restarted; no deployment/cloudchanges.

## Issue #112 — conversational acknowledgments
Immediate receipt is separate persisted message metadata; collapsed one-line activity uses actual tool reports, stays open when expanded, and precedes final content. Shared live/lab renderer updated; working drafts hidden. Actual signed-in browser observed receipt immediately, tool progress while expanded and final reply afterward.24focused checks,76supplemental regressions,3timeline checks,SSR order/draft/persistence checks,full types and runtime packaging pass. No deployment.

Issue111 browser follow-up discovered imported evidence was rejected by the whole-result16KB bound and the native-only formatter. Added a strict imported payload branch and imported local route validation without weakening native validation; compacted all47courses to15,646bytes including the full wrapper. Temporary-SQLite test now passes through the actual supplemental adapter. The post-fix grade answer still needs a fresh full browser run; prior browser result demonstrated the old failure, not this fix. Local backend restarted after code changes.

## Issue #113 — activity disclosure motion
Shared activity panel now expands/collapses with220ms measured-height motion, cancelable on rapid toggles, with reduced-motion/native fallback and keyboard support. Browser verified transitional height/overflow and settled open/closed states using a saved chat, without new model calls. TypeScript and targeted lint pass. Local HMR serves the update; no deployment or server restart required.

## Issue #114 — contextual commentary and identity follow-ups
Removed canned phrase helper. Live chat now starts model commentary alongside the actual answer, repeats requests on10second ticks using the current question/recent6turns/observed statuses, persists up to12bounded updates, and stops on completion/cancellation. An independent commentary check rejects premature answers, identity/access claims and retractions. Failed/late updates are skipped; actual delivery cadence depends on provider latency. Auxiliary model defaults6Luna and may be overridden by OPENAI_CONVERSATION_UPDATE_MODEL. No new API Function or dependency.
Identity requests now run before unrelated discovery; adjacent are-you-sure/really follow-ups resolve recent user intent and recheck the current verified session. Final identity wording is model-written from verified facts and independently checked, retaining a safe direct fallback. Actual browser confirmed contextual final confirmation; early interim contradictions were caught and then corrected. Post-check live progress wording returned200.8API/7unit checks plus types/import/catalog/packaging passed. Final strengthened commentary checker was not re-run in a full long-duration browser interaction. Local only; no long-term cross-chat memory implementation or deployment.

2026-11-27 Issue #115: Local loopback chat now retains verified source-linked historical answer snapshots independently of the rolling conversation. Session short-term + account-keyed browser long-term (80 entries/30days), owner isolation, bounded recall, status/clear commands, evaluation custom-transport bypass. No cloud writes/deployment. This is historical answer memory, not a lossless raw-evidence ledger or cross-device memory. Fresh private claims still require server-authorized sources. Focused memory checks and TypeScript/runtime-import lint passed. Full signed-in model recall acceptance remains unverified. Planning skill files absent in this checkout; existing monolithic planning used.

2026-11-27 #115 production preparation: signed-in browser persistence replaced by authenticated backend Supabase memory, service-role-only save, owner RLS, 30-day expiry/80-entry cap, generation-fenced clear, evaluator/probe bypass. Migration pending/unapplied; flag remains off. Disposable PostgreSQL owner isolation/cap/expiry/stale-save checks passed; six Node memory tests, API typecheck/import lint/compilation passed. Hosted staging acceptance, daily purge configuration and secret/flag enablement remain release gates; no push/deploy/cloud mutation.
