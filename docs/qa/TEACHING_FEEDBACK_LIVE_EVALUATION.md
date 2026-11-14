# Teaching feedback evaluator admission (Issue #100)

The default `run.mjs` suite now includes the forty independent questions from
`teaching-feedback-native-cases.mjs`. `coveredTools` declares their existing
tool policy to inventory coverage. It is not an execution result. The original
questions, literal facts, private-field exclusions and independent oracle are
unchanged.

`teaching-feedback-runner.mjs` routes their assessment through the native
teaching oracle. Raw DTOs, selected evidence, caller identity, companion sources
and absence of writes/public retrieval remain separate mandatory checks. The
runner does not accept those observations from the model response, SSE, a copied
fixture or arbitrary options.

## Current executable boundary

Every teaching case is currently an **unexecuted setup failure** in live, draft
and retrieval modes. The report includes the reason and `liveEligible: 0`.
Teaching cases are excluded from the legacy adapter's `prepare` input and are
rejected again at the direct adapter entry before credentials or network work.
A teaching-only selection performs no fixture initialization or assistant POST.
Other eligible cases in a full run retain their original adapter/HTTP path and
continue after these setup failures. All forty teaching cases remain in the
denominator, and `run.teachingFixtureUnbound` explicitly blocks release approval.

The offline runner test uses injected manifest/HTTP responses and fixture calls.
It does not run a provider, create accounts, seed a database or establish browser
acceptance. Its reports also retain `injectedDependencies: true`.

## Required next mount

1. Build a separate, caller-bound fixture lifecycle using the existing fresh A/B
   identity lease, durable intents, exact before/after readback and zero-row
   cleanup. Reusing generic `7-5`/`7-6` note rows cannot establish these native
   records. Preserve full rollback/uncertain-commit handling and prohibit admin
   promotion or submit/release/review API actions.
2. Bind real course/section/term rows before the suite hash. The native schema is
   `20261114140000_teaching_feedback.sql`: shared survey metadata is unique by
   `(term_id, phase)`; completion receipts belong to `(user_id, survey_id,
   section_id)`; immediate feedback belongs to the exact user and section.
   Anonymous survey results are a separate private table and must not be used as
   personal goldens. Shared-row writes require a separate ownership/cleanup plan;
   an existing published catalog row is not automatically authorized for mutation.
3. Correct native binding details before marking a fixture eligible:
   - Survey RPC order is `opens_at DESC, id`; the offline normal DTO currently
     uses midterm/final presentation order. A raw-read golden must use native
     order rather than reorder actual observations to fit the current fixture.
   - Survey state depends on the database clock; the fixed November/December
     2026 windows must be guarded before and after the request, or rebound with
     explicit independent expected state before evaluation.
   - Immediate eligibility and current-subject companions both derive the
     caller's enrolled current-term sections. The offline mixed fixtures use
     DB701/WS702 for eligibility but CUR301/CUR302 for current subjects. They need
     a consistent live fixture and reviewed companion golden; do not silently
     trim either read to manufacture that mismatch.
   - Native caps are 50 surveys, 200 eligible courses and 100 feedback rows. Cap
     cases require real ordered data and honest unknown-total/omission semantics.
     Deliberate read-failure cases need an approved failure-injection seam, not
     fabricated unavailable responses. Both stay in the denominator if deferred.
4. Add trusted request-bound observations. The current public response exposes
   tool events, not the raw native DTO or selected verification evidence. Bind
   server correlation, deployed revision, exact request and the fixture owner's
   session to independent commitments for both stages. Use fixed counters and
   hashes in shared logs, never comments, owner IDs, credentials or survey answer
   contents. A fixture read before/after the request proves data stability, not
   which source the assistant actually read.
5. Only after those contracts are mounted, replace the setup admission, feed
   validated observations to the existing independent grader, and execute the
   actual graph HTTP path with the current pinned deployment gates. Preserve
   original failed responses, two-owner isolation and verified cleanup. Default
   coverage must still fail any deferred case or missing browser evidence.

## Offline verification

```sh
node --test tests/evaluation/teaching-feedback-runner.test.mjs \
  tests/evaluation/teaching-feedback-native-cases.test.mjs \
  tests/evaluation/run.test.mjs tests/evaluation/runner-pinning.test.mjs \
  tests/evaluation/runner-integrity-review.test.mjs \
  tests/evaluation/live-fixtures-contracts.test.mjs \
  tests/evaluation/fee-remission-runner-selection.test.mjs
```

Expected: all tests pass; mocked teaching-only execution reports forty setup
failures, zero assistant requests and zero fixture calls. The mixed control
executes its two ordinary cases while retaining both teaching setup failures.
