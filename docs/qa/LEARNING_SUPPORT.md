# School Affairs learning support requests

Issue [#100](https://github.com/LuxArt0317/std_edu_ai/issues/100). Service 27-1 is titled 完善就學獎勵學習輔導申請 in the captured [service catalog](../../src/features/public/affairs/catalog.json). Its source leads to a separate university sign-in. The [captured Student Affairs notice](../../public/school-pages/3bd31dd39caaa4506054.html) is dated 2026-11-03 and describes the university program and announcement links.

The stu.best intake records a student's own topic and request for assistance. Authorized site administrators can begin and complete a review. Review completion is a site workflow state. University application fields, criteria, awards, and disbursements remain with the university's WeakReward service. Existing tracking notes remain independent.

## API foundation

Migration `20261116100000_learning_support_requests.sql` adds owner-only rows and durable private operation receipts. It contains no records. School Affairs Google identity is required at the database boundary. The existing trusted site administrator check protects the review queue and review writes. A student can submit or withdraw only their own request. A review moves `submitted` to `in_review` and then to `reviewed`. Students can withdraw while a request is submitted or in review.

- `GET /api/affairs-data?scope=learning-support&page=1` returns the current caller's requests. `scope=learning-support-review` returns the trusted staff queue. The API accepts only `scope` and optional `page`. It uses 25 rows per page.
- `POST /api/affairs-action` accepts `submit_learning_support` with `{request_id, topic, details}`, and `withdraw_learning_support` with `{request_id, id, expected_version}`.
- `POST /api/affairs-manage` accepts `review_learning_support` with `{request_id, id, expected_version, status, note}`. Status is `in_review` or `reviewed`.

Each response binds the request ID, record ID, local status and version. Reuse the same request ID and payload after an uncertain response. A changed payload, expired record version, or disallowed transition returns a conflict.

## Workspace and assistant

Students can submit, view and withdraw their own requests at `/school-affairs/services/27-1`. The page links to tracking notes at `/school-affairs/services/27-1/notes`. Authorized administrators can open `/school-affairs/services/27-1/review`. Each write requires confirmation. The confirmation retains the same command for a retry after an uncertain response.

Ask the campus assistant “What is my learning support application status?” or “How many learning support requests do I have?” The status answer identifies the most recently updated saved request. The assistant checks the existing School Affairs session, uses saved status and count, and links to the 27-1 workspace. The topic, request text and review note stay in the workspace.

## Verification

```sh
node --test tests/evaluation/learning-support-workflow.test.mjs
node --test tests/evaluation/learning-support-assistant.test.mjs
npx tsx --tsconfig tsconfig.unit.json --test tests/unit/learning-support-routing.test.tsx
npm run typecheck:api
```

The actual-handler evaluator verifies own and manager query boundaries, rejected fields and stale or crossed request handling through controlled transport. The disposable PostgreSQL check also verifies RLS, trusted role enforcement, replay after a subsequent transition, operation audit cardinality and rollback. Publishing requires applying the additive migration before enabling the workspace.

## Protected Preview evaluation

The 17-case packet in `tests/evaluation/learning-support-native-packet.mjs` is ready for a protected operator to supply four adapters.

- `readRaw` uses `readLearningSupportNativeRows` and the two exact disposable owners. Seed the three reserved requests and record their identity lease, row IDs and original values in the private fixture journal before evaluating.
- `readNative` reads the paired `/api/affairs-data?scope=learning-support&page=1` pages with each account’s own token. The packet compares the two pages to the independent SQL snapshot.
- `ask` uses the signed-in endpoint for A or B and the public endpoint for the guest handoff. Pass the response status, JSON thread activity, and signed-in correlation ID to the packet.
- `confirm` dispatches the oracle’s exact native action to `/api/affairs-action`. Bind one `confirmedLearningSupportCommand` per deliberate POST to that caller token and unchanged JSON body. Persist the proposed row ID, expected version and operation ID before the first action probe. A repeated attempt gets a fresh relay for the same command.

An operator must hold the existing client fixture lease, verify the exact clean deployment and applied migration, and recheck the pinned origin and release throughout the run. Cleanup must compare the full original or once-withdrawn fixture snapshot under the native actor locks, then remove the exact synthetic rows, receipts and identities. Keep credentials, raw fixtures and real caller fields out of the report. Hosted acceptance requires the 17 case results and verified cleanup. The transport and paired oracle run offline with `node --test tests/evaluation/vercel-preview-transport.test.mjs tests/evaluation/learning-support-native-packet.test.mjs`.
