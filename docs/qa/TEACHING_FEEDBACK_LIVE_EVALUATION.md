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

The default suite records the original teaching cases as **unexecuted setup
failures** in live, draft and retrieval modes. Its report includes the reason
and `liveEligible: 0`. A separately scoped protected operator can select 13
original prompts with the existing sample fixture.
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

### Original boundaries and verified empty records

```sh
node tests/evaluation/run-teaching-sample-preview.mjs --original --preflight
node tests/evaluation/run-teaching-sample-preview.mjs --original <protected-preview-origin> <source-revision>
```

The preflight lists 13 original prompts within the 40-case bank. Eleven use a
signed zero-read disposition for navigation, exclusions, other-user requests,
privacy or unsupported writes. The other two require native checks of empty
survey and immediate-feedback DTOs for the exact disposable caller. Both counts
are separate from the 11 additional sample questions.

The operator takes the original question, route and answer rubric unchanged. It
compares the native empty DTO to the original fixture after binding the real
disposable caller and still requires exact signed raw and selected evidence
digests. The homepage and DTM proof routes allow only a single direct teaching
link; private reads remain limited to the service routes. The lease, paired SQL
and caller readbacks, revision pins, exact cleanup and protected-owner checks
apply to the full packet. This operator does not create shared survey windows or
provide acceptance for the other 27 original cases.

### Original teaching-feedback questions in scratch PostgreSQL

All forty original prompts pass their independent rubrics against the actual assistant handlers in the scratch replay. The replay covers survey state, completion, windows and phase comparison, immediate status, timestamps and opt-in comments, separate and mixed sources, explicit exclusions, access boundaries, navigation, empty results, and controlled outages. The four ambiguous or unrelated prompts and the signed-out prompt verify zero account reads. The harness pins time inside the authored survey interval. It validates caller-bound RPC arguments, raw order and records, typed projection counters, independent answer verdicts and unchanged stored rows.

The two outage cases inject an HTTP 503 for the selected failed transport only. Healthy sibling reads use PostgreSQL. Each cap scenario inserts one extra row beyond the native 50-survey, 100-feedback or 200-eligible-course limit and requires an unknown total. For the two mixed prompts, historical DB701/WS702 feedback retains its authored states, while the separate current timetable and immediate eligibility both contain CUR301/CUR302. The original offline fixture still exists. The scratch evaluator explicitly opts into this reviewed SQL scenario, with the original prompt, answer facts and rubric intact. Those two mixed cases, the exclusion with current subjects and year, the three cap cases and the two outages exercise the verifier with a controlled reviewer response referencing the observed evidence paths. All other replayed cases use deterministic verification or zero-read guidance.

The exclusion-only prompt is assessed as an access acknowledgment. The original record-answer classification required verification of a record and supplied no record facts. The unchanged prompt now requires acknowledgment with no read or verification events and no record citations or cards, and remains in the 40-case denominator. No live provider, external network, assistant writes or public research are used by the scratch replay.

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
   - Preserve the reviewed scratch distinction between current enrollment and
     historical feedback when authoring mixed hosted fixtures. Verify the same
     current sections in the eligibility and timetable reads.
   - Preserve the independently verified cap boundaries and raw ordering in a
     hosted fixture. The controlled scratch outage replay does not mount a
     hosted failure-injection seam.
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
