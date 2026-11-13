# Student assistant evaluation

System-wide question bank, independent grading, discovered coverage and per-case evidence reports for Issue #100. See [acceptance criteria and commands](../../docs/qa/ASSISTANT_SYSTEM_EVALUATION.md).

- `surface-inventory.mjs`: discovers current catalog, tool and public-page denominators.
- `service-cases.mjs`: per-service student questions and explicit capability limitations.
- `account-cases.mjs`, `fixtures.mjs`: independent account/DTM/academic facts and questions.
- `public-cases.mjs`: captured-page context, campus navigation and anonymous privacy questions.
- `grading.mjs`, `coverage.mjs`: deterministic scoring and full-run eligibility.
- `run.mjs`: inventory, retrieval, draft and real-endpoint execution; ignored private reports.

`*.test.mjs` tests grade integrity and retrieval behavior. No evaluation imports private university captures or uses a real student's records. A model's own verification result is never sufficient for passing.

Some assistant gaps are integration gaps in existing native systems. The course catalog, certificate assessments and DTM submission editor are mounted and have dedicated backend APIs. Their data is not currently registered as an assistant read tool. A profile answer does not pass a certificate assessment question, and an assignment tracker status does not prove a committed file or graded revision. These remain uncovered capabilities even when the assistant correctly states its limitation.

The smallest read-only integrations are:

- Catalog: call `loadCourseCatalog` from `server/courseCatalog.js` with validated, bounded filters and pagination. Project offering fields and normalized syllabus sections with their local detail/syllabus links. Preserve sample provenance, explicit counts and the distinction between an offering and the user's enrollment; do not infer eligibility from capacity or prerequisites.
- Certificate assessment: call caller-scoped `loadEnrollmentCertificate` from `server/enrollmentCertificate.js`. Project only the explicit term, pending-fee flag, status, result text, assessment timestamp and revision, with `/school-affairs/services/17-1`. Preserve nulls and `local_demo` provenance. Never call the admin reader for personal chat or expose document metadata as issued, verified or downloadable documents: the own endpoint deliberately returns `documents: []`.
- DTM submissions: resolve an owned assignment, then call `loadDtmSubmissionWorkspace(account, assignmentId)` with the default `admin: false`. Build a model-safe projection of committed/current and reviewed historical revisions, their filenames, commit timestamps, review status, literal grade text and feedback joined by `upload_id`. Pending upload reservations are not submitted work. Keep storage paths, upload tokens, signed download URLs and reviewer identifiers outside model evidence. Link to the local assignment detail page; downloads remain separate authenticated UI actions.

Each integration also needs a registered planner capability, own-account and parent/child validation, bounded evidence selection, source-linked answer verification and persistent tool events. Before changing the corresponding evaluation from a capability gap to a supported answer, add independent golden fixtures and tests for empty data, foreign owners, revision mismatch, null versus zero, stale/failed reads and forbidden write claims. Real upload/submission actions remain a separate consent and receipt-verified workflow; adding metadata readers does not authorize model uploads or certificate issuance. These are source-code findings, not confirmation that a particular deployment has the migrations or data.
