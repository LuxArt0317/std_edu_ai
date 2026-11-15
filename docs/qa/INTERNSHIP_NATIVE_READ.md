# Internship record evidence

The frozen reader and independent question bank were authored on
`04e68b0c924918ae9f074447ac8a7c6554f7b70b` and integrated into the
School Affairs assistant starting from Student Leave candidate `93b579e`.
The main evaluator registers the bank. Live fixture and request-observation
bindings are pending.

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
4. Register the 30 questions with the evaluator and mark any live cases
   with unresolved fixture setup until a trusted two-account fixture,
   request-level observations and cleanup proof are available.

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
Hosted Supabase, browser and real-model evaluation remain pending.
