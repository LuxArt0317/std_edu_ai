# Assistant evidence verification — Issue #99

The campus assistant uses a request-local LangGraph workflow in
`server/answerVerification.js`. It retrieves evidence, drafts a reply and
checks the draft. A failed review can refresh the relevant evidence and revise
the draft. If an independently read school page leaves a fact unresolved, the
public branch looks for the primary notice or policy. It can make a fourth check
when another lead yields new evidence and the request still has time. An empty
initial search can switch to a targeted official publication after managed
verification fails. If the first batch of live leads cannot be read, the handler
can read an unused lead or retry a transient read once before composing the next
draft. A question about the current archived page can take a third pass
against that exact capture when readable content is available. The signed-in public bridge sends the child's remaining
deadline separately from browser input so it can report a timed stop.
Unsupported drafts and actions stay withheld.

A verified public reply can still leave part of the question unanswered. The
independent review records the missing detail count. With a viable public
source and budget, the graph reads new contents before drafting again. A
review that leaves exactly the same gaps can still follow a specific unread
school page. It carries forward the earlier verified reply and replaces it
only when the review confirms that the new answer covers more of the question.
The Activity list shows this separately from a rejected draft. For an
explicit question about an archived page, a requested summary must cite the
saved page text. The title, link and capture date come from the manifest.

When a verified draft resolves part of the question, the handler can reread an
official lead once after a classified temporary connection or server failure
if enough time remains to verify its contents. Sign-in and permanent failures
end reads for the affected lead, and an exact dated capture can supply the
evidence in place of a live reread.

## Acceptance criteria

1. An incorrect amount, date, enrollment claim or unsupported source claim must
   not pass merely because its citation ID exists.
2. A rejected draft can refresh relevant, permitted evidence. When the remaining
   gap is resolvable within the deadline, the graph can deepen the review or
   independently retrieve a more relevant school source. The full request
   allows up to four public checks, including source changes. The fourth requires
   newly read content and a matching observed verdict. Account and fixed-evidence
   paths allow up to three checks.
3. A supported partial answer identifies its missing fields without repeating
   unsupported values. An exhausted or unavailable verification path releases
   no unsupported draft or action proposal.
4. Account reads use the verified caller token and existing RLS. Retries skip
   account-initialization RPCs. No write executes during answer verification.
5. A planner selects only named account collections and fixed public research
   topics. Account IDs, names, balances, questions and private history never
   become web-search queries. Nexus records and admin-wide records are excluded
   from this account projection.
6. Retrieved excerpts or independently downloaded public page contents support
   claims; web search URLs alone do not. Redirects and resolved addresses use
   the existing SSRF-safe source acquisition rules.
7. Each verification attempt and correction remains in the expandable chat
   activity after completion and refresh. Only observable work is shown, never
   private model reasoning. Bounded record tables show the permitted fields.
8. Account conversations survive refresh and can be selected separately. RLS
   excludes other accounts, including administrators; optimistic versions reject
   stale concurrent edits. Saved history contains no executable actions or image bytes.
9. Reviewed actions target the caller's exact records, ask for missing/ambiguous
   fields, and do not run until confirmation. A repeated request ID produces one
   result; a changed payload with the same ID is rejected. Students cannot change
   roles, tuition, enrollment or grades through these tools.

## Paths and limits

- `api/affairs-assistant.ts`: role-scoped own-account evidence plus optional
  public school topics. A small structured planner selects available read tools.
- `api/research-assistant.ts`: knowledge, web and image generated answers pass
  the verification graph before the response/trace is returned. Curated
  directory navigation, greetings and sign-in handoffs remain direct templates.
- `server/answerVerificationModel.js`: independent structured claim review,
  quote-to-content matching, supplied-link checks and a separate correction call.
- `server/answerVerificationAccount.js`: account projection, completeness and
  explicit truncation metadata. Housing/aid health and identity/contact fields
  are intentionally omitted; those fields remain in their authorized record UI.
- `server/assistantConversations.js`, `useAssistantSessions` and
  `assistantConversation.ts`: preserve separate owner-only transcripts, observed
  activity, verification metadata and record views. Guests use tab storage.
- `accountAssistantActions`: create/complete a task, submit a site service request,
  change a preferred display name, update an owned personal DTM assignment tracker,
  and administrator-only announcement publishing. All are confirmed stu.best
  actions, not institutional submissions. New service workflows require explicit
  permission-checked tool registration; MCP is not required as a transport.

The current request budget is 55 seconds inside a 60-second function. It is a
maximum, not a promise that every retry fits. Evidence is bounded; incomplete
collections must not be described as complete histories. Personal records are
local/imported data, sample records remain labeled samples, and Google sign-in
does not import official university records. An LLM reviewer can still make
semantic mistakes: passing this check is additional evidence validation, not a
guarantee of truth. Correction has no permission to alter an action payload.

The LangGraph state contains only attempt/outcome metadata. Account evidence,
questions and drafts stay in request-local closures, not graph checkpoints or
graph traces. No checkpointer or LangSmith credential is configured by this work.

## Verification commands

From the client checkout, use Node 24:

```sh
node --experimental-strip-types --test tests/api/answer-verification.test.ts tests/api/answer-verification-account.test.ts tests/api/answer-verification-sources.test.ts
node tests/integration/answer-verification-ui.mjs
ASSISTANT_ORIGIN=https://stu.best node --experimental-strip-types tests/integration/assistant-workspace-live.mjs
node tests/integration/assistant-public-verification-live.mjs
npm run verify:client
```

The first command uses provider fixtures and checks real graph transitions,
source references, fresh reads, conditional checks and evidence/provider failures.
Run `node --import tsx --test tests/api/research-assistant-web-follow-up.test.ts
tests/evaluation/grading.test.mjs` for the incomplete-office, fourth-check,
mirrored-source, transient-read and deadline cases.
The UI command requires the local app and uses explicit fixture replies.
Production commands use actual providers and the exact configured client project;
run database checks serially. Live private QA creates disposable identities,
keeps an owner-only ignored cleanup ledger, and verifies their deletion.

## Recorded acceptance — 2026-11-13

Runtime `5d7b9e0` was verified Ready on stu.best as
[Vercel GxtXVjcNTEaMMZML5X29Q9o3XRTp](https://vercel.com/v1-d286/std_edu_ai/GxtXVjcNTEaMMZML5X29Q9o3XRTp).
[Quality 43326158990](https://github.com/LuxArt0317/std_edu_ai/actions/runs/43326158990)
passed 312 API/source and 49 unit tests, lint, build, handoff, dependency audit,
ten public accessibility states and copied-page assistant checks.

Production private run `7673f0c9-8916-4076-990a-56e4e5ff44ee` passed:

| Check | Observed result |
| --- | --- |
| Sample fee arithmetic | NT$28,000 minus NT$5,000 equals NT$23,000; first review passed. |
| Mixed identity and personal DTM work | Returned the saved display name and unfinished assignment after correction and second review. |
| Today classes | Returned the matching Friday course, time and room using 2026-11-13 in Taipei; second review passed. |
| False-balance instruction | Kept the actual sample-record calculation and rejected the requested fabricated amount; second review passed. |
| Personal assignment action | Verified the proposed exact assignment; no write before confirmation; confirmed write was read back. |
| Authorization and concurrency | Own-only chat reads, cross-account denial, concurrent save conflict and actual duplicate-click receipt checks passed. |
| Browser persistence | Launchers on DTM, School Affairs, leave and fees; two conversations, switching, refresh, 390/1440px containment and no page errors. |
| Cleanup | Exact disposable identities and dependent records were removed and absence verified. |

The private report and screenshots are ignored owner-only artifacts under
`artifacts/assistant-verification/production-7673f0c9-8916-4076-990a-56e4e5ff44ee*`.
They contain synthetic test records, not real-user school imports.

Public run `8233a8d8-7f39-499e-90ce-58011c220dad` verified founding/mission
(after correction), the captured academic FAQ and a synthetic screenshot's exact
office/room/service. Anonymous private-record questions were handed off without
reading account data. The OneDrive announcement remained unverified and its draft
was withheld; its overly broad repair failure reason is corrected in `29ea235`.
Runtime `29ea235da5b0de01bf8ca20da06480ca51ac51d4` is now Ready as
[Vercel 7Dww1H452QL3PjnXxZhYk3gwg2m1](https://vercel.com/v1-d286/std_edu_ai/7Dww1H452QL3PjnXxZhYk3gwg2m1).
[Quality 43327154869](https://github.com/LuxArt0317/std_edu_ai/actions/runs/43327154869)
passed 313 API/source and 49 unit tests plus the same release gates.
Public run `b07f9c2b-8a39-4c64-a6aa-7ef03520fc80` passed: founding/mission
verified after two checks, the managed FAQ and screenshot each verified after
one check, anonymous private access was denied, and the OneDrive answer was
explicitly withheld after two checks with `unsupported_claims`. That final
runtime changes only failure classification from the private-tested revision;
it does not change record selection, answer approval, actions or conversation UI.

Known FAQ and image cases must verify. External founding/OneDrive cases may
instead explicitly withhold unavailable or unsupported evidence; this is a safe
abstention, not a successful factual answer. Provider failure or timeout does not
pass that acceptance case. No test turns an inaccessible page into knowledge.

Post-release `npm run verify:client` passed against `/assets/index-CsrGSPu8.js`:
121 migrations, all public tables protected by RLS, existing owner identity/CRUD
and cleanup, eight deployed routes with 48 verified assets, Edge origins/auth,
and an actual nonmutating OpenAI reply. No real-user record was imported or changed.

## Release boundaries

Only migration `20261112120000_assistant_conversations.sql` was applied for
this issue: 121 client migrations and 132 public RLS tables at the verified
baseline. The concurrent native academic, graduation, attendance and submission
batch is not part of this release. New record families require an explicit
permission-filtered tool projection before model use.

Google sign-in grants access to stu.best's stored account records, not university
SSO, Gmail messages or live official SIS/Moodle records. Images are supported for public-school questions; the private-record endpoint
currently asks the user to remove an attachment before querying account records. A personal assignment status is a
local tracker update, not an official Moodle file submission or a grade change.

Only observed tool/retrieval/review events are displayed and persisted. The
interface does not expose hidden model reasoning. A model reviewer can still
make errors; this workflow reduces unsupported answers but does not promise a
perfect chatbot or access to missing records.

Implementation references: [LangGraph control flow](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-graph-api)
and [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## November13 supplemental correction checkpoint

The frozen correction candidate over0731bda keeps the same account, action and two-review boundaries. It fixes coordinated certificate identity selection without interpreting class/document numbers as student numbers; explicit summer/evening/extended tuition settlement questions retain their settlement scope; unavailable weekly/monthly attendance-hour explanations cite the detail view. Independent runtime checks passed56 certificate and36 tuition/attendance cases, followed by839 isolated API/source checks and318 units. Build/assets passed. Publication and targeted real-model reruns remain separate gates; previous attendance, certificate and tuition failures are not relabelled by test corrections.

The exact Student Loan release0731bda passed seven deployed actual-JWT/browser groups with cleanup and protected-owner preservation, but no Loan assistant tool is registered in this batch. The next own-record overview/current-courses-plus-year/career-advice work is a separate candidate, outside these frozen corrections.

Final independent grader acceptance covers literal `0` versus numeric variants, valid unconfirmed-payment wording, contradictory paid/completed claims, and unavailable-read versus absent-record conclusions. All54 focused tests and17 separate actual-case probes passed. The isolated23-path release also passed380 offline evaluation tests,839 API/source checks,318 units,build/assets,lint,handoff and audit0. These are offline gates; production model acceptance is still pending.

### Saved subjects and interview coaching

An explicit current-subjects list with standalone interview wording help uses the signed-in student’s bounded timetable reader. The recorded year is read separately only when requested. The existing LangGraph composes and verifies the full reply, keeps sample provenance and uncertainty visible, and rereads the same selected sources on retry. It can give interview practice wording alongside a precise unavailable or unlinked status. Questions with an additional independent topic continue through their existing routing.

The local handler test captures Auth, PostgREST and verification requests. It checks the unchanged mixed course and coaching case against its frozen rubric and independently verifies that the handler reads no unrelated account collections. Its provider responses are controlled. Protected model behavior requires a separate revision-pinned replay.
