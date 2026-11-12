# Assistant evidence verification — Issue #99

The campus assistant uses a request-local LangGraph workflow in
`server/answerVerification.js`: retrieve → draft → verify → finish, with one
failed-verification edge back through fresh retrieval and correction. Two
failed checks, unavailable evidence/provider, malformed output, or the time
limit return an explicit inability to verify. Unsupported drafts, their
citations and proposed actions are withheld.

## Acceptance criteria

1. An incorrect amount, date, enrollment claim or unsupported source claim must
   not pass merely because its citation ID exists.
2. A rejected answer reloads permitted evidence and receives at most one
   correction. The correction must pass the same independent review.
3. A second failure returns no guessed answer or action proposal. A timeout or
   provider outage has the same fail-closed behavior.
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

## Verification

Run `node --experimental-strip-types --test tests/api/answer-verification.test.ts
tests/api/affairs-assistant.test.ts tests/api/research-assistant.test.ts` from the
client checkout. The tests cover the real graph transitions, correction bounds,
unavailable/hung dependencies, evidence IDs/quotes, image prerequisites,
authorized account projection, public/private separation, links and API activity.

Local provider-fixture checks cover the graph and 1440/390px persisted activity.
`assistant-workspace-live.mjs` passed against the actual client database on
2026-11-13: two-account authorization, concurrent save conflict, concurrent action
replay, persistent nickname, personal-only assignment status editing, visible
signed-in launchers, separate chats, refresh and phone containment. The disposable
accounts were removed and verified absent. This local mode uses fixture model
responses only for the browser assertions. Production real-model checks and
publication remain pending and must be recorded separately.

Implementation references: [LangGraph control flow](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-graph-api)
and [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

A live school anti-bot response contains no evidence. Verification may instead use the exact already-published public capture, matched by source URL and SHA-256, with its capture date and non-live status in the evidence. Unmatched or changed captures remain unavailable.

## Runtime correction acceptance

Initial Quality43257279965 passed, but Vercel rejected13 functions. Consolidation dbad655 fits12 functions and Quality43258502350 passed; live private checks then exposed an emitted .ts import path. The handler now uses .js plus declarations. Public-source robot challenges returned no readable evidence; exact versioned public captures now require their SHA256, date and original URL match. Captured evidence cannot pass as live: both answer and citation visibly identify the snapshot date. Focused graph/conversation/source checks pass15 tests, including tampering and missing provenance rejection. Real deployed private/public acceptance must be rerun before release acceptance.

Live c70b4d3 verifies conversation/action transport and database behavior, but both the first tuition and founding/mission answers were withheld. The next correction accepts only formatting whitespace outside JSON string values in copied evidence quotes (changed values and noncontiguous joins still fail), requests exact contiguous quotes, and logs only aggregate rejection flags/counts. Image corrections may cite attached-image only if an actual attachment exists.
