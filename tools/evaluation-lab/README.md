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

The question bank now comes directly from [SURVEY_FAQ.md](../../docs/guides/SURVEY_FAQ.md), with its full composed answers as editable references. On the first startup with `survey-faq-v1`, the local server backs up existing state into an owner-only `before-survey-faq-*.json` file inside ignored `.evaluation-lab/`, replaces all old questions with the 53 FAQ entries, and clears the old visible run history. Later restarts preserve edits and newly generated runs. Archived old questions are not retained in the active list. Input image files remain private for recovery from the backup.

Public guidance uses the public assistant; personal-record questions use the signed-in account assistant. FAQ references contain conditional instructions rather than fixed student facts. They do not get a fabricated keyword match score; add required phrases or explicitly request an AI review for comparisons. Importing questions does not run them, upload them to the knowledge base or deploy the app.

Question CRUD: **Add a question** creates an entry; selecting one reads it; **Edit question & answer** changes its question, answer, page and session; **Delete question** removes it from the active list. The **Deleted questions** filter exposes reversible restoration and historical runs. Deletion does not silently erase past evaluation evidence.

## Hosted deployment

Vite emits the standalone HTML entry and Vercel rewrites `/evaluation-lab` to it. The hosted UI authenticates every operation with the School Affairs session. The trusted SQL administrator check runs before reading the model catalog, any question/run data, images, evaluator or agent invocation. A student or signed-out caller cannot use this private workspace. The static HTML alone contains no saved questions, private results or credentials.

Migration `20261124220000_evaluation_lab.sql` adds RPC-only, administrator-and-owner scoped database storage. Workspace saves use a revision compare-and-swap under a database lock, so competing instances/tabs receive a conflict rather than silently overwriting history. Images are private owner-bound rows, fetched with authentication and rendered using browser blob URLs; bearer tokens never enter image URLs. Hosted state is limited to 3 MB to stay below Function response limits, with a 50 MB retained-image quota per administrator. Exhaustion rejects a new write, never trims history. Local storage retains its existing 20 MB limit.

Hosted and local workspaces are separate: deployment seeds the hosted account's first workspace with the 53 FAQ entries. It does not upload local account answers, images or runs. Model selection applies through a protected run operation that invokes the actual assistant handlers with request-scoped overrides. Existing handlers retain their own rate limits; batches stay opt-in and paced. No action-confirmation API is exposed through Answer Lab.

Deployment explicitly excludes `.evaluation-lab/`, environment files, generated QA artifacts and tutorial-source media via `.vercelignore`. Runtime grader modules under `tests/evaluation/` remain available to the Function bundle; no test runner is invoked by Answer Lab itself.
