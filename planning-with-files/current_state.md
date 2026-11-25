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
- Q52 grading timed out again. A confirmed transport bug gave grading15seconds despite its configured30-second deadline. The local patch now honors that30-second window without changing grader/model/output budget; reload and try grading the same answer once.
- Recovery receipt: `.evaluation-lab/diagnostics/regression-grade-recovery-20261125.json`. Exec51219 TERMINAL.
- Local store:53cases/313runs at last read; last cloud merge287runs/rev116. New local results have NOT been uploaded/deployed.

## Local fixes and verification

- f8b512d3: focus-only rejected drafts retain validated missing-detail labels as untrusted repair hints, not facts or a pass. Public reviewer interruption can recheck the same draft/evidence once with25seconds remaining, existing limits, no proposed action and no reread/rewrite.
- Public grader v2 prefers the current native contact catalog over its obsolete imported404 capture. Five contact rows are checked against registered hashes, literal source lines and field values. Rubric/weights/reference/70target unchanged; historical grades retained.
-29core/provider/graph checks and13grader-context checks passed. Provider timeout follow-up adds one further passing check. API types/runtime-import lint293/0 passed; JavaScript-only hosted dispatch packaging passed with0provider calls/3fixtures.
- UI lint:0errors/5warnings on unchanged hook/export/unused-variable code. No new rendered-browser claim.
- Earlier local private fixes: Q03 current-caller charge grading; Q12 leave-count units/date/status clarification and current-caller leave grading; Q05 page-backed scholarship navigation/history/status evidence; Q15 real curriculum-plan navigation and current/legacy report guide. Private grading source adapters currently support Q03/Q12 only.
- Q05/Q12/Q15 fixes passed focused contracts but still require real signed-in model evaluation. No universal graduation credits, inferred cohort, award/payment, attendance or approval claims added.

## Next actions

1. Commit/reload the grader-timeout patch; local server currently exec63137 caches backend modules. Do not restart during an active model/grade process.
2. Grade saved Q52 once, then fresh Q09 with Luna/Terra6.1 using the loaded feedback/recheck fixes. Diagnose any failure before another producer run.
3. Continue Q20,Q30,Q43,Q44 one at a time. Q43 omitted published club social links; confirm the actual source projection before changing it. Q30/Q44 failed review timeouts; Q09 focus-only coverage feedback was previously dropped.
4. Complete real signed-in acceptance for the12private cases. Nine have historical authenticated production answers; Q17/Q27/Q49 have no saved private answer. Do not export browser tokens or impersonate the user. Dedicated Codex computer controls remain unavailable; no desktop/headless browser fallback is authorized.
5. After the next behavior batch, regress prior retrieval cases as required; skip unchanged prepared guidance and do not repeatedly retune scores already at70.

## Boundaries and handoff

No new deployment, provider configuration, database/schema change or account-role expansion occurred in this local follow-up. Real private acceptance remains unproven. Missing Q50 registration leaves were added to existing P0Issue102 without fabricating working forms. Keep the goal active.
