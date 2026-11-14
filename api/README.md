# HTTP API

`affairs-data.ts?scope=graduation-clearance` reads private applications, available periods and office decisions. The `manage` view takes a term and optional candidate. Dedicated student and administrator actions are versioned and retry-safe.

`affairs-data.ts?scope=teaching-feedback` reads survey completion, immediate feedback, or authorized management by `view`. Dedicated student and administrator actions save evaluations, feedback, survey settings, releases, and reviews.

`affairs-data.ts?scope=early-graduation` reads the caller’s application window, eligibility and history or returns a grounded assistant answer. `early-graduation-admin` takes a term and optional student. The student and administrator write endpoints dispatch separate versioned operations.

`affairs-data.ts?scope=credit-transfer` returns the caller’s applications or an assistant answer. The admin scope selects a student. Dedicated action and manager operations handle draft saves, submissions and per-course review.

`affairs-data.ts?scope=course-withdrawal` reads the signed-in student’s term and withdrawal-phase records. The admin scope takes a term only. Dedicated actions in `affairs-action.ts` and `affairs-manage.ts` apply versioned changes and window edits through Supabase.

## Account conversations and verified replies

`affairs-data.ts?resource=conversations` (public alias `/api/affairs-conversations`) supports owner-only list/read/save/delete with the School Affairs Google session. Saves enforce a 190KB request limit, bounded text/history and database version checks. `affairs-assistant.ts` selects account evidence and runs the bounded LangGraph verification loop; `research-assistant.ts` verifies generated knowledge/web/image answers. `affairs-action.ts` accepts an optional reviewed-action `requestId` and uses durable receipts for replay protection. None of these endpoints borrow Nexus credentials or execute a write during answer verification.


Vercel serverless endpoints live here. `research-assistant.ts` answers public school questions from governed knowledge, the captured service directory, images, and verified web sources. `affairs-assistant.ts` verifies a separate School Affairs Google session and never loads Nexus records; `school-assistant.ts` remains the protected Nexus operating assistant.

`affairs-data.ts` returns personal DTM and service records for the same verified Google identity. `affairs-action.ts` validates edits, imports and site review requests before passing them to owner-scoped database functions. Anonymous callers receive HTTP 401 for the private account endpoints.

`affairs-manage.ts` accepts audited, admin-only sample enrollment, charge and assignment updates. Database authorization checks the verified Lux Google identity and each linked student's record. The private assistant routes school-record follow-ups to account data and does not send that data to the public research endpoint.

Native academic grades, modern/legacy graduation reports and attendance share these endpoints. Eight manager operations use versioned database RPCs; the graduation report alone has a 140KB HTTP envelope for its strictly validated nested content. Private assistant evidence preserves requested record types and terms, literal values and local links without treating Moodle scores as academic transcripts. See [native acceptance](../docs/qa/ACADEMIC_RESULTS.md).

Assistant POST requests may set `stream: true` to receive server-sent `progress` events followed by one `result` or `error` event. Older JSON clients keep the same response contract. Private progress starts only after the Google bearer token is verified; public lookups never receive that token.

The public research entrypoint is a thin wrapper around `server/researchAssistantHandler.js`, shared by the School Affairs assistant. Runtime cross-function imports must target deployable JavaScript helpers. `npm run test:live-shell` verifies both compiled endpoints start before exercising page assets; method-denied checks do not call a provider.

Syllabus requests use the explicit `syllabus-search`, `syllabus-options` and `syllabus-detail` scopes. Metadata writes use the strict `syllabus-metadata` manager kind; unknown prefixed scopes and additional fields fail closed. Both routes share a17-second request deadline for these operations.

## Tuition statements and document metadata

The next tuition batch uses the existing endpoints, without adding a serverless function:

- `GET /api/affairs-data?scope=tuition-documents` returns the verified caller's complete settlement periods and literal statements. It accepts no account filter and excludes administrative document metadata.
- `GET /api/affairs-data?scope=tuition-documents-admin&user_id=<selected-account-uuid>` requires live administrator authorization and one selected account. Missing, repeated or additional query fields are rejected; unknown `tuition-` scopes fail closed.
- `POST /api/affairs-manage` accepts the exact `{kind,payload}` envelope for `save_tuition_settlement`, `delete_tuition_settlement`, `save_tuition_document_metadata` and `delete_tuition_document_metadata`. Payloads require the selected `user_id`, immutable record `id`, stable `request_id` and `expected_version`; the helper validates each kind's exact fields and 26,000-byte JSONB limit.

Reads and writes retain the caller JWT and share a 17-second API deadline. Conflicts return HTTP 409; authorization and provider failures retain safe status/error responses. Both read scopes return `documents: []`: metadata cannot issue a PDF, enable Print or supply a Storage/download capability. These new tables are not registered with assistant tools.

Offline integration checks and the rollback-only migration preflight passed. Migration `20261112180000_tuition_documents.sql` is applied and actual-JWT local acceptance passed; production release acceptance is pending. See [tuition acceptance](../docs/qa/TUITION_DOCUMENTS.md) for the precise verification boundary.

Conduct38-1 uses `GET /api/affairs-data?scope=student-conduct` for the caller, or exact `scope=student-conduct-admin&user_id=<uuid>` for a live administrator. `/api/affairs-manage` supports strict save_student_conduct/delete_student_conduct envelopes. Extra/repeated query fields, cross-account personal reads and unrelated resource dispatch are rejected. [Conduct QA](../docs/qa/STUDENT_CONDUCT.md).

Grade reports use strict `affairs-data` scopes `dtm-grade-report`, `dtm-grade-report-overview`, `dtm-grade-report-admin` and `dtm-grade-report-courses-admin`. Personal scopes never accept another account selector. `affairs-manage` dispatches only exact save/delete report envelopes to caller-bound RPCs. See [grade-report QA](../docs/qa/DTM_GRADE_REPORTS.md).

`npm run typecheck:api` checks all Function TypeScript entrypoints in standalone NodeNext mode and is required by `npm run build`; frontend-only TypeScript checks do not cover these files.

`affairs-data` exposes strict `dtm-course-content`, administrator inventory/course-picker and exact-assignment scopes. `affairs-manage` dispatches versioned content save/delete operations. These scopes cannot fall through to conversation handling; see [course content QA](../docs/qa/DTM_COURSE_CONTENT.md).

Moodle resource reads use strict `dtm-course-resource` scope with one course and material ID. No caller-supplied account selector or conversation fallback is accepted. See [resource QA](../docs/qa/DTM_COURSE_RESOURCE.md).

`GET /api/affairs-data?scope=fee-remission` returns the signed-in account’s history. `fee-remission-admin` takes one `user_id` and requires the verified administrator. `POST /api/affairs-manage` accepts `save_fee_remission` and `delete_fee_remission` with a request ID and expected version.

`GET /api/affairs-data?scope=exchange-grant` reads only the signed-in account’s grant drafts. `POST /api/affairs-action` accepts the exact grant draft, report and deletion envelopes. Both endpoints use the caller JWT and reject account selectors.

`GET /api/affairs-data?scope=tutor-evaluation` reads the signed-in account’s evaluation and verified profile fields. `POST /api/affairs-action` accepts `submit_tutor_evaluation` with a request ID, ten ratings and an optional comment. Both routes require the caller’s Google identity.

`GET /api/affairs-data?scope=curriculum-plan&code=115101` returns an inline public curriculum PDF for an allowlisted plan code. This scope takes no user ID and sends no account token. The preview is bounded to 4.4 MB. The UI provides the direct university download for preview failures.

`GET /api/affairs-data?scope=curriculum-map&program=1&year=115&track=L創新應用` reads the public curriculum map. It accepts only captured selectors and returns plain-text summary and semester tables.

`GET /api/affairs-data?scope=interdisciplinary-programs` reads the public Supabase catalog without an account selector. This scope accepts no additional query parameters.

`GET /api/affairs-data?scope=program-registrations` reads the verified caller’s registrations. Optional `answer=en|zh` renders only that caller’s records for the campus assistant. `change_program_registration` submits a reviewed local registration or withdrawal.

`GET /api/affairs-data?scope=course-substitution-departments&term=...` provides public department suggestions. `scope=course-substitution&year=110&track=1&department=01` reads the exact selection. Account selectors, extra parameters and mutation methods are rejected.

`GET /api/affairs-data?scope=first-selection-notice` reads the latest dated initial-selection notice and its three Taipei windows. The scope is read-only, accepts no additional selectors, and returns 503 for a missing or incomplete notice.

`GET /api/affairs-data?scope=course-adjustment&phase=add_drop` reads the caller's current-term decision. Use phase `late_add` for late add or `answer=en|zh` for its deterministic assistant reply. The separate `course-adjustment-admin` scope requires a student ID and term. `POST /api/affairs-manage` accepts `set_course_adjustment_eligibility` with versioned and replay-safe fields. `GET /api/affairs-data?scope=late-add-notice` reads public notice content.

The facility-repairs read scope supports the signed-in area and equipment catalogs, private lists, details and assistant statuses. The action and management endpoints handle confirmed reports, cancellation and review.

The course-adjustment scope accepts summer decisions with an optional academic year. The public summer-selection-notice scope requires one academic year.

Student profile scope `student-profile` has caller-owned and selected-account administrator reads. The action and manager handlers accept versioned confirmation and baseline writes.
