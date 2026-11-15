# Internship record evidence

The frozen reader and independent question bank were authored on
`04e68b0c924918ae9f074447ac8a7c6554f7b70b` and integrated into the
School Affairs assistant starting from Student Leave candidate `93b579e`.
The main evaluator registers all 30 questions. The separate protected operator mounts 24, including 17 exact own or empty record reads and seven access or capability boundaries. A protected deployment replay is still pending.

| Native view | Stored subtype | Eligible fields |
| --- | --- | --- |
| Contract | `contract` | Saved organization title and tracking status. Saved start and end dates, notes and site review status when requested. |
| Self-assessment | `self_assessment` | Saved title and tracking status. Reflection and site review status when requested. |
| Company application | `company` | Saved company title and tracking status. Notes and site review status when requested. |
| Enterprise directory | `company` | The caller's saved company rows shown by that local view. The reader provides no institution-wide company list or enrollment evidence. |

The reader makes a single GET with the verified caller JWT. The query
uses the literal `internship` service key, the matched subtype, an
explicit caller filter and requested columns. Review requests are joined
only on an explicit review-status question and independently checked
against the caller and the record's linked request ID. A linked review
that cannot be read leaves its status unknown. A tracker's filed state
records the user's own designation. The linked review remains a stu.best
workflow, independent of university filing, receipt, registration,
eligibility and approval.

A successful empty lookup identifies local absence in the selected
view. Bad records, credential failure, timeout, or transport errors
produce unavailable evidence. The 25-row and 16,000-byte output bounds
include exact omitted counts. Raw own account IDs, linked request IDs,
unrequested notes, contact details and unrelated service data are absent
from the evidence. An explicitly provided record UUID is retained as
the request selector. The module has no mutation or first-use
provisioning capability.

## Runtime integration

1. Route signed-in matching questions through the account endpoint,
   and guests to their selected local sign-in return. Perform ownership
   and mutation denials before loading any account snapshot or
   extracting a public research query.
2. Register `internshipRecords` as a supplemental reader. For a selected
   own view take the minimal account snapshot path. For a supported
   compound request select only the isolated fee or timetable reader
   alongside the internship reader. Preserve the original question for
   selecting and refreshing the records, then pass only the selected
   clauses to verification. Unknown clauses ask for separate handling.
   Excluded, foreign and unsupported clauses do not expand the read scope.
3. Parse `account:internshipRecords` before formatting. Verify requested
   field paths from the selected rows, successful empty counts, and
   actual availability limitations. Retry fresh reads with the same
   allowed scopes. Withhold unverified drafts and private data cards.
   Keep independent verified companion evidence available when the
   internship read fails.
4. Register all 30 questions in the general evaluator. The isolated protected operator is the execution path for its 24 supported questions. The general runner cannot substitute weaker fixtures or observations.

## Offline verification

Run these commands with Node 24 from the project root.

```sh
node --test tests/evaluation/internship-native-{cases,reader,runner}.test.mjs
node --experimental-strip-types --test tests/api/affairs-assistant-internship.test.ts
node tests/evaluation/run.mjs --mode inventory
```

The first two commands exercise independent fixture expectations, exact
transport, own view scope, missing/failed reads, linked review integrity,
public guidance, the actual LangGraph endpoint with a controlled reviewer,
retry, and runner setup. The endpoint is independently graded against all
30 cases, including rejection of added institutional receipt and false absence
claims. Inventory registers four exact question routes,
30 native questions and four prior cases requiring fixture rebinding.
The controlled endpoint rehearsal also runs every mounted protected case through the independent grader and signed receipt checks.


## Protected Preview packet

```sh
node tests/evaluation/run-internship-preview.mjs --preflight
node tests/evaluation/run-internship-preview.mjs "$PREVIEW_ORIGIN" "$DEPLOYED_REVISION"
```

The first command reads the frozen inventory and requires no credentials. The second requires the clean exact revision, existing project fixture credentials and an authorized Development `VERCEL_OIDC_TOKEN`. The operator pins the release, uses two disposable Google-qualified student accounts and stores state changes in the private fixture journal before starting a transaction. Routes are the contract, self-assessment, company application and directory under `/school-affairs/services/internship`.

Before and after each question, independent SQL confirms the saved records and linked review rows. Each caller performs its own and the crossed read for both tables. Signed Preview receipts bind the exact request, response, direct record query, count and selected field projection. Complete exact standalone answers carry a signed native verification event. The response remains bound to the actual read and selected projection, and the receipt requires zero provider calls for that path. Bounded or partial answers continue through model evidence review. A third review may reuse the second scoped read, and the signed response must contain the actual completed review event. The guest case grades the sign-in return without a signed record observation. The two tuition companions, two timetable companions, failed reader and failed-reader tuition companion remain controlled-only. The four older general-workspace cases also require rebinding.

The operator writes an owner-only report. It records checked case IDs, exactly observed read and review counts, hashes, and cleanup status. Provide `--cases` followed by comma-separated registered case IDs to replay a subset. A successful subset establishes only those selected verdicts. A failed or interrupted restore retains the exact private journal for reconciliation.

The optional `STU_INTERNSHIP_TEST_PG_SOCKET` test accepts an owner-only scratch Unix socket and validates the exact migrations, RLS, recovery from an uncertain commit, and cleanup on disposable local rows.
