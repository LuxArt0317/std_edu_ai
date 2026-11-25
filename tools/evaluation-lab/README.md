# Answer Lab

A separate evaluation website at `/evaluation-lab` for inspecting campus assistant behavior. See [setup](SETUP.md) to launch it.

## Workflow

Select one of 53 survey FAQ questions in the grouped sidebar, or add your own. Edit the expected answer and optional required phrases, attach up to two input screenshots, then run that question or all enabled questions. Account questions use the existing School Affairs Google session on the same local origin. Each request uses the real local public or account assistant endpoint. Nothing runs automatically on page load.

Choose agent and evaluator models independently and select reasoning effort. Available models are read server-side from the configured provider account. Request-scoped overrides cover composition, planning, verification and web search without changing environment variables or concurrent chats. A saved run records its selected model and effort even when deterministic conversation handling needs no model call. This is selected configuration metadata, not provider billing telemetry.

Actual answers use the product Markdown and expandable Activity components, with input thumbnails, sources, suggestions and retrieved record tables. Generated output images are not requested or rendered. Proposed actions are displayed read-only; the lab cannot confirm a write on your behalf.

## Scores and history

Rule match reuses `tests/evaluation/grading.mjs`. It measures configured content checks, not semantic truth. Full contract failures remain visible separately. Cases without positive content criteria receive no percentage. Optional AI review compares the answer against the saved reference across correctness, completeness, relevance and communication; its score is separate from the deterministic contract. A rubric-only account reference is not proof of a factual grade, tuition balance or enrollment: enter exact expected account facts for those comparisons.

Every answer stores its question, expected-answer snapshot, reference version, attachment references, response, activity, timing, HTTP status, source revision, selected model and reasoning. Evaluator reviews also retain model, effort, timestamp and all prior completed or failed attempts. Updating a reference does not rewrite earlier results. Archive/restore provides reversible deletion while retaining history.

Stop cancels the current browser request and remaining queue; upstream work already dispatched may still incur cost. Batch dispatch is paced and stops on rate limiting. JSON export contains saved metadata and attachment references; it does not embed the image files.

## Private local storage

`.evaluation-lab/state.json` and `.evaluation-lab/attachments/` contain private questions, account answers and input screenshots. They are ignored by Git. Writes are serialized and atomic; files use owner-only permissions. The 20 MB state limit rejects new writes rather than silently discarding history. Archive does not reclaim retained historical files. Back up the whole directory, not just the JSON export. API credentials are never written into this store.

`/__evaluation_lab/` provides state, model catalog, case create/update, archive/restore, attachment add/read/remove, result persistence and optional judge operations. Local routes are loopback middleware. Hosted routes reuse the existing `/api/affairs-data` Function with `resource=evaluation-lab`; no extra Function is added. Hosted access requires a verified Google account and the existing trusted School Affairs administrator permission.

## Acceptance status

Initial rendering, a deterministic English-language case and saved history were inspected before the user paused testing. The latest model-selection, attachment, archive and evaluator-history additions have not received runtime acceptance. Automated checks and model/evaluator calls are paused at the user's request; the next step is manual testing.

## Survey FAQ question bank

The 53-question bank comes from [the canonical Q&A README](../../docs/question-answer/README.md). Spreadsheet reference synchronization versions changed references, preserves previous snapshots and run history, and backs up state before migration. Unchanged source entries preserve later user CRUD edits. Expected answers are supplied only to the evaluator, never the answering client.

Public guidance uses the public assistant; personal-record questions use the signed-in account assistant. FAQ references contain conditional instructions rather than fixed student facts. They do not get a fabricated keyword match score; add required phrases or explicitly request an AI review for comparisons. Importing questions does not run them, upload them to the knowledge base or deploy the app.

Question CRUD: **Add a question** creates an entry; selecting one reads it; **Edit question & answer** changes its question, answer, page and session; **Delete question** removes it from the active list. The **Deleted questions** filter exposes reversible restoration and historical runs. Deletion does not silently erase past evaluation evidence.

## Hosted deployment

Vite emits the standalone HTML entry and Vercel rewrites `/evaluation-lab` to it. The hosted UI authenticates every operation with the School Affairs session. The trusted SQL administrator check runs before reading the model catalog, any question/run data, images, evaluator or agent invocation. A student or signed-out caller cannot use this private workspace. The static HTML alone contains no saved questions, private results or credentials.

Migration `20261124220000_evaluation_lab.sql` adds RPC-only, administrator-and-owner scoped database storage. Workspace saves use a revision compare-and-swap under a database lock, so competing instances/tabs receive a conflict rather than silently overwriting history. Images are private owner-bound rows, fetched with authentication and rendered using browser blob URLs; bearer tokens never enter image URLs. Hosted state is limited to 3 MB to stay below Function response limits, with a 50 MB retained-image quota per administrator. Exhaustion rejects a new write, never trims history. Local storage retains its existing 20 MB limit.

Hosted and local workspaces are separate: deployment seeds the hosted account's first workspace with the 53 FAQ entries. It does not upload local account answers, images or runs. Model selection applies through a protected run operation that invokes the actual assistant handlers with request-scoped overrides. Existing handlers retain their own rate limits; batches stay opt-in and paced. No action-confirmation API is exposed through Answer Lab.

Deployment explicitly excludes `.evaluation-lab/`, environment files, generated QA artifacts and tutorial-source media via `.vercelignore`. Runtime grader modules under `tests/evaluation/` remain available to the Function bundle; no test runner is invoked by Answer Lab itself.

## Shared chatbot presentation
The question, generated answer and live activity use the same `AssistantChatMessage` as the campus chatbot. `LabChatMessage.jsx` mounts it in a shadow root with the application stylesheet so dashboard CSS cannot change the chat presentation. Lab action confirmations are disabled; results never execute account mutations. The expected-answer panel always shows the saved question reference, separately from model output and progress. Historical runs retain their original reference snapshot for evaluation; the version warning identifies comparisons against an older reference.

## Local prompt-strategy review
The November 25 review uses the locally saved question bank without changing expected answers or saved runs. Fresh-agent trials and direct API observations live separately in ignored `.evaluation-lab/prompt-trials/2026-11-25`. These are strategy trials, not results attributed to the lab-selected model. The public, committed scope and limitations are in [the review](../../docs/guides/CHATBOT_ANSWER_STRATEGY_REVIEW.md).

AI review after each answer is enabled by default for a new lab page session. Uncheck it to generate without model evaluation. Parallel runs default to three cases at a time. Choose 1–4 in the Parallel runs selector; 1 is sequential. Each worker generates and saves its answer, then awaits its own AI review. Request starts remain globally paced at 5.2 seconds; long requests overlap without unbounded dispatch. Each case has separate activity, results and review/model history. Stop run cancels outstanding browser requests and leaves completed/saved answers intact; rate limits stop queued cases while already-started work drains. The UI waits for all workers before enabling another batch. Nothing starts on page load.

`parallel-runs.mjs` owns bounded scheduling and shared dispatch pacing. Pure queue checks: `node --test tools/evaluation-lab/parallel-runs.test.mjs`; they make no model or evaluator requests. Review failures do not reload/replace the entire workspace while other results are arriving.

### Shared website chat flow
The browser lab and website both call `src/services/websiteAssistant.ts`. An active School Affairs session selects the same authenticated client, including native service routing; guests use the public client. The lab adds request-scoped model headers and the hosted admin proxy through `chat-transport.mjs`, then saves/evaluates the response. Run history records session mode and dispatched endpoints without credentials. Existing saved runs remain historical. The CLI bank runner is API-only and does not prove browser client parity.

### Focused browser-client evaluation
`node scripts/run-answer-lab-client.mjs --only survey-faq-q06 --label q06-trial` runs one public question through the real browser client in installed Chrome, saves its result and separate judge review, and stores a private checkpoint under `.evaluation-lab/client-runs/`. `--history-run RUN_ID` supplies a real previous answer for the same question to check follow-up wording. It does not manufacture account sign-in, hydrate attachments, or read expected answers into the producer. Use the lab UI for those cases.

## Reading model quality
The question list, answer badge, history and overview show the separate AI evaluator score (`judge.score`), not the deterministic rule/contract percentage. Green means at least70% with no explicit failed evidence verification; amber indicates improvement or unverified evidence. Ratings estimate agreement with the reference, not objective accuracy. The overview counts active questions only, takes the latest attempt per question for the selected answer model and current reference version, and never substitutes a previous best score. A later failed or unreviewed attempt removes the old passing score from that current view. Old reference runs remain in history but are marked outdated.

Use **Scores for** to inspect the selected answer model, any saved model, or all models. Filter below70%, at least70%, 85–100%, a custom inclusive range, unrun, unreviewed, failed, or outdated. Sort by score within each topic. Score filters do not change the Agent model used to generate a new answer. The summary shows review coverage as well as the average, so untested questions are not mistaken for passes. On phones the list can be closed and closes when a question is selected.

Default score controls: Selected answer model, All scores and statuses, Highest score first. Select All answer models to view stored scores from other models.

Local development defaults are GPT-6 Luna answers and a separate GPT-6.1 Terra evaluator. Existing history retains the model used for each run and judgment. Local model defaults are refreshed once when the configured default changes, while later explicit choices remain saved. Hosted configuration is unchanged.

The focused browser-client runner uses an isolated same-origin document without development HMR. It still calls the website assistant and lab transport; it is a client/API evaluation, not proof of interactive or visual UI acceptance.

New CLI bank runs display API-only evaluation / UI not checked. Execution metadata is sanitized server-side, retaining only bounded known provenance fields. Existing run history is not relabeled as browser verification.

Use **Run shown** to run only enabled questions currently visible under the search/score/scope filters. **Run enabled** retains its whole-bank behavior. The `?filter=account` view opens the signed-in subset without starting any requests; private runs still require the real browser session and use the same website assistant client.

The account-filter deep link starts with sequential execution. It does not sign in or start the batch. If using the direct Vite page, use `/tools/evaluation-lab/index.html?filter=account`; the development shortcut preserves the query after the next server restart.

Public grading uses **public-source-context-v2** for new reviews. It retains bounded, checksum-verified registered snapshots and the fixed stu.best static-capture fallback. The native contact directory takes precedence over its obsolete imported error-page capture: catalog fields and literal source lines must match the registered source bytes. A failed source pin/read produces unavailable context, not a fallback claim that the native page is missing. Client verification flags and supplied excerpts are not trusted. The four criteria, weights, reference and70 target stay unchanged; earlier v1/reference-only grades remain in history and are not directly comparable. Reconstruction is not proof of original retrieval, personal records or current policy. No historical runs are rejudged automatically.

Q03 (charges) and Q12 (leave usage) may use `account-source-context-v1` when the current verified caller matches the run actor and exact case snapshot. The four grading criteria/weights stay unchanged. Current records are reconstructed for comparison, not proof of historical values or execution ownership. Record values go only to the ephemeral grader input; saved summaries contain hashes and scope/time metadata. A different caller, unknown context or unsupported question remains reference-only. Local private grading forwards an existing signed-in session when available; public requests do not require sign-in.
