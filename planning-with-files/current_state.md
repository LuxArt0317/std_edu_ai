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
