# Student assistant evaluation

System-wide question bank, independent grading, discovered coverage and per-case evidence reports for Issue #100. See [acceptance criteria and commands](../../docs/qa/ASSISTANT_SYSTEM_EVALUATION.md).

- `surface-inventory.mjs`: discovers current catalog, tool and public-page denominators.
- `service-cases.mjs`: per-service student questions and explicit capability limitations.
- `account-cases.mjs`, `fixtures.mjs`: independent account/DTM/academic facts and questions.
- `public-cases.mjs`: captured-page context, campus navigation and anonymous privacy questions.
- `grading.mjs`, `coverage.mjs`: deterministic scoring and full-run eligibility.
- `run.mjs`: inventory, retrieval, draft and real-endpoint execution; ignored private reports.

`*.test.mjs` tests grade integrity and retrieval behavior. No evaluation imports private university captures or uses a real student's records. A model's own verification result is never sufficient for passing.

Live fixture creation records each reserved identity's email and run marker in the ignored owner-only ledger before sending the Auth request. Cleanup reconciles both values before deleting a fixture. An ambiguous creation timeout with no matching row remains unresolved: its recovery ledger is retained and the run cannot pass cleanup. A pre-existing account or mismatched run marker is never adopted or deleted. No password or session token is written to that ledger.

The working-tree assistant now registers four supplemental readers alongside its 17 default collections. Their graph and transport contracts have offline coverage; deployed semantic acceptance remains separate. A profile answer does not pass a certificate assessment question, and an assignment tracker status does not prove a committed file or graded revision.

The read-only integrations are:

- Catalog: the supplemental reader calls published-only `loadSyllabusSearch` and `loadSyllabusDetail` with validated selectors and bounded pagination. It does not use the administrative catalog reader. Offering fields and syllabus sections retain local detail/syllabus links, sample provenance and explicit counts; a published offering never establishes personal enrollment.
- Certificate assessment: call caller-scoped `loadEnrollmentCertificate` from `server/enrollmentCertificate.js`. Project only the explicit term, pending-fee flag, status, result text, assessment timestamp and revision, with `/school-affairs/services/17-1`. Preserve nulls and `local_demo` provenance. Never call the admin reader for personal chat or expose document metadata as issued, verified or downloadable documents: the own endpoint deliberately returns `documents: []`.
- DTM submissions: resolve an owned assignment, then read the `dtm_submission_workspace` RPC with the verified caller's credentials. The projection includes committed/current and reviewed historical revisions, filenames, commit timestamps, review status, literal grade text and feedback joined by `upload_id`. Pending upload reservations are not submitted work. Storage paths, upload tokens, signed download URLs and reviewer identifiers stay outside model evidence. Links open the local assignment detail page; downloads remain separate authenticated UI actions.
- Tuition: read the caller's literal settlement statements separately from charge balances. Null, blank text and the literal text `0` have distinct meanings; none proves a payment, issued receipt or completed refund.

Each integration has a selected planner capability, own-account and parent/child validation, bounded evidence, source-linked verification and observable tool events. Certificate/tuition fixtures create only exact disposable caller-owned records and verify complete scoped readback for both accounts. Published catalog cases bind through both fresh caller JWTs before model requests, save their concrete expectations and final fingerprint, and reject record/revision drift before and after each answer. Missing bindings remain setup failures with zero model calls. Catalog-only cases do not reseed private data or mutate the shared catalog.

Real file-upload fixtures remain deferred pending a reviewed Storage cleanup lifecycle; metadata-reader tests do not prove live submission behavior. Actual upload actions and certificate issuance are separate capabilities. The runner's minimum 5.5-second request-start interval avoids burst retries; errors remain failures. These are implementation and test-method statements, not a claim that the entire current deployment passes the full evaluation.
