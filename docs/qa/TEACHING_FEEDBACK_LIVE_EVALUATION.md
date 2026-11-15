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

## Sample-section fixture

`teaching-feedback-sample-fixture.mjs` binds the exact existing `SAMPLE-2026-FALL`
term and three `SAMP101`–`SAMP103` sample sections through a read-only catalog
query. The fixture requires zero surveys for that term. It writes only the two
disposable account profiles and their independently authored immediate-feedback
records. Two distinct student sessions can hold different comments and statuses
for the same section. The second account also has an empty-history state.
Current eligibility and survey completions are empty. Creating a student row
would trigger additional sample data, so eligibility and current-subject
questions need their own fixture.

Each observation compares the four caller-scoped native DTOs and checks two
management denials and two crossed direct-table denials. Independent SQL state
checks keep the native history, catalog binding and account changes distinct.
The transition journal keeps the prior and pending states so an interrupted
commit can be reconciled before deleting only the exact fixture rows.

Run the local fixture checks with
`node --test tests/evaluation/teaching-feedback-sample-fixture.test.mjs`.
Set `STU_TEACHING_TEST_PG_SOCKET` to a private, opt-in scratch PostgreSQL socket
for the database test. Use the scratch database setup in the
[evaluation README](../../tests/evaluation/README.md) with the directory prefix
`stu100-teaching-pg.` and the teaching test command. The database test applies
the real migrations, checks the paired and empty fixture states, recovers an
uncertain commit after recreating the fixture controller and verifies cleanup and
preservation of an unrelated caller's row.

### Additional protected sample questions

Run `node tests/evaluation/run-teaching-sample-preview.mjs --preflight` to
list the eleven additional questions by count, including seven real native reads
and four privacy/action boundaries. This command performs no network requests.
The sample packet has its own case IDs and independent rubric. Its coverage
does not replace any of the original forty entries.

The live command requires the clean deployed revision, its exact protected
Preview origin, and the same Development `VERCEL_OIDC_TOKEN` and disposable
fixture environment used by the other protected operators.

```sh
node tests/evaluation/run-teaching-sample-preview.mjs <protected-preview-origin> <source-revision>
```

The application signs request-bound raw DTO and selected evidence commitments.
The operator checks those commitments against the saved history of the two
isolated account profiles and verification events. A complete standalone
reply can use a single signed check of the exact text, table and citation.
Model-reviewed replies retain their separate completed-review evidence.
Compound requests, reader failures and excerpted evidence stay with the
existing verification graph.
Its private report stores verdicts and hashes. Cleanup verifies the exact fixture identity and
row removals and preserves the protected owner. A passing sample report covers
saved local history, empty reads and restricted actions. Published survey
windows, survey completion, eligibility, companion sources, caps and service
failures retain their original evaluation requirements.

### Original teaching-feedback questions in scratch PostgreSQL

Twenty-six unchanged original cases run through the actual assistant handler and the migrated PostgreSQL RPC. These cover survey status, course completion, dates, phase comparison, Traditional Chinese, immediate status and timestamps, literal comments, survey exclusion, separate views, review status versus delivery, empty records, navigation, caller denials, and unsupported submissions. The harness pins its test-process clock inside the authored midterm-open and final-scheduled interval. It checks the exact caller-bound RPC requests, raw response order, typed projection counts and fields, the independent answer rubric, and unchanged stored rows. Model, external network, writes and public research are outside this replay.

The remaining 14 original cases still need separate evidence. The signed-out handler provides a return link to the requested feedback page. The frozen anonymous case expects the bare login URL. Real PostgreSQL results for cap and failure variants, independent companion evidence for mixed subjects, and the other untouched cases retain their original evaluation requirements. These local runs do not establish deployed or live-provider results.

Use a locally installed PGlite runtime entry. The test skips without the explicit path and never downloads a package.

```sh
STU_TEACHING_TEST_PGLITE_ENTRY=/absolute/path/to/@electric-sql/pglite/dist/index.js \
  node --experimental-strip-types --test tests/evaluation/teaching-feedback-survey-postgres.test.mjs
```

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
