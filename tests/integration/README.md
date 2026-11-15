# Integration checks

`assistant-session-receipts-ui.mjs` uses a compiled local preview and controlled Google, assistant and conversation responses. It checks that an altered save receipt is rejected, retry reuses the same chat version, reopening fetches saved activity, and deleting a chat removes an already-committed account copy after a lost response.

`elearning-catalog-assistant-ui.mjs` runs the compiled page against the actual signed-in and public assistant handlers with synthetic auth and storage. It checks the rendered catalog course link and the guest's exact filter and page return. Run it with `node --experimental-strip-types` and a local `PUBLIC_SITE_ORIGIN`.

`school-affairs-ui.mjs --inventory-only` follows each of the 94 catalog links and checks for an enabled, visible assistant launcher. The result records launcher presence separately from navigation and does not count as live workflow evidence.

`node tests/integration/assistant-renderer-inventory.mjs` exercises the signed-in routes declared by the assistant inventory and the resulting pages after documented acknowledgement and login transitions. It starts the actual application in its own loopback Vite server. Use `--family student-club-attendance`, `--family dtm`, or another family ID for a focused run. It checks each listed route at desktop width with and without a synthetic Google session, and repeats selected high-use paths on a narrow viewport. It records exact navigation, workspace shell, account state, visible launcher, keyboard activation, modal focus, Escape and focus restoration separately. School Affairs and DTM account-menu entry and selected login-return guards have their own outcomes. The JSON report under ignored `artifacts/assistant-renderer/` identifies routes with missing response fixtures. OAuth, semantic answers, private data authorization, and hosted behavior require their separate suites. The equipment route run also checks restoration of one exact edit selector and rejects malformed, repeated or extra parameters.

Use `--family school-service-views` for protected service subviews and `--family school-service-acknowledgements` for the teaching-assistant and exchange-grant notices. The latter confirms the blocking notice on its own route, acknowledges it by keyboard, and checks assistant access on the resulting workspace. `--family legacy-route-aliases` checks that copied DTM assignment and grade-report links stay usable through local sign-in. The synthetic student reaches the signed-in shell of administrative routes. The records admin view verifies the exact student denial, with no administrator record request. Administrative authorization and data remain separate checks.

Across `--family dtm`, `--family dtm-submissions` and `--family legacy-route-aliases`, the signed-in runner waits for real Moodle components to display synthetic layout settings, saved course content, a resource, literal grade reports and an existing submission filename. Each covered view must complete its expected authenticated read. Context probes send a question from native and copied views in fresh tabs, verify the exact canonical page in the authenticated request and check the synthetic answer and conversation receipt. The report records data readback and page context separately. All responses stay local to the browser fixture.

Use `--family academic-document-readback` to replay the four academic detail routes. It checks rendered catalog and syllabus values from an exact account request, the selected curriculum iframe and PDF response, and the selected course substitution with its replacement row opened by keyboard. The fixtures use the existing offering validator and substitution parser. The PDF and substitution endpoints remain unauthenticated reads inside the signed-in page checks.

Use `--family facility-repair-readback` for the four repair history and management routes. The signed-in student fixture verifies the owned list and detail, including a status, history note, and exact assistant request from the detail. Both management routes must render the expected student refusal and keep the assistant available. The report counts those two denials separately from owned-record rendering. A successful manager view requires its own manager fixture.

Use `--family student-clubs-readback` for the Club Services and Club Officer subpages. One synthetic student has an officer membership in a single club. The runner checks the calendar, owned equipment request and prefilled edit, application and completion records, profile, and the chosen club's roster and participation results. Both review routes must deny the student and show the pending review row to a separate synthetic site-manager. The report counts manager reviews, student denials, and signed-in record rendering separately. Two assistant transport probes verify the exact selected equipment and roster routes. The manager checks use local response fixtures and leave live manager authorization to its separate test.

[Remote-learning Moodle QA](../../docs/qa/ELEARNING.md) covers the browser flow, exact-client enrollment and retry checks.

Counseling checks cover the scoped database rollback, actual authenticated API requests with disposable-account cleanup, and menu-to-appointment browser flow. See [counseling QA](../../docs/qa/COUNSELING.md).

The record-manager, course-selection-manager, credit-load-history, pending-fees, student-aid, scholarship and housing synthetic suites now open `/school-affairs/admin/records` directly. `school-affairs-entry-ui.mjs` checks that the removed `/records` summary redirects to the native index while retaining its Google/Nexus session-isolation assertions. These fixtures verify UI routing and request contracts, not real database persistence. The November13 removal check passed all seven manager suites and focused entry/PKCE/redirect assertions under an isolated no-proxy server. The full entry suite still fails its later Escape focus assertion, reproduced unchanged against d72; its raw failure is retained, and conversation requests missing from that older fixture were blocked rather than sent to production.

`school-affairs-ui.mjs` uses an explicit 94-entry menu inventory with exact destination selectors. `--inventory-only` runs those actual clicks without the preceding layout suite. Reports distinguish native mounts, partial pages, generic trackers, redirects and copied documents; reaching a destination does not prove its workflow is complete. Unexpected API calls, external navigation and page errors remain failures.

## Verified assistant and persistent chats (Issue #99)

`node tests/integration/answer-verification-ui.mjs` checks activity/verification persistence at desktop and phone widths with an explicit local provider fixture.

`node --experimental-strip-types tests/integration/assistant-workspace-live.mjs` exercises the real configured client database through local handlers and two disposable Google-linked synthetic accounts: chat isolation/conflicts, actual replay races, persistent profile nickname, personal DTM tracker permissions, visible launchers and multiple chat sessions. It removes its exact fixture accounts in `finally` and verifies their absence. An owner-only ignored `active-fixtures-<runId>.json` ledger remains until cleanup is verified, allowing exact recovery after an interrupted process. Local browser AI replies are explicit UI fixtures.

`ASSISTANT_ORIGIN=https://stu.best node --experimental-strip-types tests/integration/assistant-workspace-live.mjs` uses deployed endpoints and actual configured model calls for tuition arithmetic, mixed profile/DTM questions, date-specific classes, injection resistance, a verified proposed action and confirmed database readback. Reports are private ignored artifacts; no token or password is logged. Never run against a different project. Apply only migration120000 after inspecting `npm run db:plan -- --only=20261112120000`.


Run focused integration scripts through the `test:*` commands in the root `package.json`. `school-affairs-entry-ui.mjs` exercises the isolated Google session and assistant drawer with synthetic provider fixtures; it does not establish a real Google callback.

`dtm-course-ui.mjs` checks course/grade geometry against the observed 1533px Moodle layout, record details, menu-based assignment creation/edit/deletion, grade editing, phone overflow and accessibility with a synthetic private account. Run with `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5173 node tests/integration/dtm-course-ui.mjs`; ignored screenshots go to `artifacts/dtm/`. `dtm-ui.mjs` checks the home, guest/login, responsive navigation and assistant entry. `student-workspace-live.mjs` follows the same course menu against deployed APIs and the client database with a disposable identity, then removes it.

`scholarship-ui.mjs` uses synthetic API responses only. It checks the source-derived desktop gutter/header, phone layout, open/upcoming/closed/reviewed periods, empty/history states, apply/cancel/reapply, failure/retry receipt keys, busy buttons, administrator publish/review forms, the signed-out route, overflow and accessibility. Run with `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5173 node tests/integration/scholarship-ui.mjs`; ignored screenshots go to `artifacts/scholarship/`. Only the two observed university brand/notice contrast failures are reported as preserved source exceptions, and only when their exact computed source colors match; every other serious/critical violation fails the suite. This is not a full WCAG pass. The suite makes no live account or database mutations and does not establish institutional submission or production persistence.

`student-workspace-rls-live.mjs` checks ownership, relational constraints, repeat imports, deletion and site review in a rolled-back transaction against the exact client database. Add `--preflight` to apply the pending migration inside that transaction. `student-workspace-live.mjs` uses a disposable identity to check the deployed forms, assistant links, persistence and responsive accessibility, then removes the fixture.

`affairs-record-manager-ui.mjs` checks the Lux sample-record forms at phone width with a synthetic Google session and API responses. `affairs-workspace-rls-live.mjs` rolls back a two-account database transaction after checking fee and assignment seeding, cross-account isolation and nonadmin write denial.

`school-mirror-ui.mjs` also checks the direct homepage at 3020, 2048, 1440, 768, 390 and 320 pixels: the sticky header spans the viewport, navigation stays centered, one hero slide fills the carousel, and the page has no sideways scroll.

The School Affairs entry check also verifies the local campus carousel at four viewport widths, automatic rotation, arrows, pause behavior and reduced-motion defaults.

`school-home-layout-ui.mjs` checks all ten homepage entrance cards at twelve desktop, tablet and phone widths. It fails when a title or description crosses its card, the page scrolls sideways, or the expected responsive grid does not render. Set `STU_BASE_URL` to a running local preview or `https://stu.best`; screenshots and JSON results are ignored under `artifacts/site-mirror/home-layout/`.

`school-mirror-navigation.mjs` holds a captured stylesheet open to verify that direct copied content and links work without waiting for that stylesheet. `direct-school-assistant-ui.mjs` opens the same-origin assistant on the homepage, student page and a query-selected news page at desktop/mobile widths; it verifies a chat answer, Escape, close, reopen and top-level School Affairs sign-in. Run it with `npm run test:school-mirror-navigation`; the full `test:school-mirror` command includes it.

`assistant-progress-ui.mjs` checks streamed activity, the final expandable timeline, source links, current-tab restore, failed/interrupted turns, New chat, desktop/phone layout and accessibility; run it with a local Vite server using `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5173 node tests/integration/assistant-progress-ui.mjs`. `school-affairs-entry-ui.mjs` also checks JSON activity restore, image/action storage exclusions and private transcript removal on sign-out.

`boot-recovery-ui.mjs` simulates an old HTML entry pointing to a removed JavaScript bundle. It requires a single automatic refresh to the current entry and checks the no-JavaScript fallback text. The recovered sign-in page may show either its form or the missing-configuration state in credential-free CI; in both cases the boot shell must be removed. Run it with `npm run test:boot-recovery`; the full mirror command includes it. To exercise the compiled production HTML, set `BOOT_HTML_PATH=dist/app-shell.html` and `PUBLIC_SITE_ORIGIN` to a running `vite preview` URL.

`scholarship-concurrency-live.mjs` uses the guarded client database to exercise overlapping RPCs on separate backends. It verifies retry identity, stale-version conflicts, cancellation/review races and administrator period creation, then removes and verifies absence of its disposable fixtures. It never provisions or changes a real owner identity; missing existing admin authorization is reported as unverified. `scholarship-workspace-live.mjs` checks the deployed browser, real API and account assistant with two disposable synthetic student accounts and a temporary application period, including persistence, isolation and reviewed/closed guards; it removes all fixtures afterward. Run these only against the authorized client target recorded in `deployment.json`.

`student-aid-ui.mjs`, `housing-ui.mjs` and `course-catalog-ui.mjs` check the source-derived native destinations using synthetic responses. Set `PUBLIC_SITE_ORIGIN` to a running local server. They exercise account/empty/error/retry states, manager forms, narrow screens and source geometry. Housing additionally covers changed consent, a closed period and recovery of a receipt after a lost response. Aid deliberately retains measured source contrast exceptions rather than claiming a full accessibility pass.

`student-aid-rls-live.mjs`, `housing-workspace-rls-live.mjs`, `course-catalog-rls-live.mjs` and `course-syllabus-rls-live.mjs` verify the exact client database in rolled-back transactions; `--preflight` applies a pending migration transactionally. Never use these scripts against another project.

`native-student-services-live.mjs` combines real client API/RPC/database checks with the browser. Run `NATIVE_ORIGIN=http://127.0.0.1:5184 node --experimental-strip-types tests/integration/native-student-services-live.mjs` for a local runtime; omit `NATIVE_ORIGIN` to verify the configured production domain. It creates two disposable accounts and exact temporary aid/housing fixtures, checks persistence, isolation, private assistant answers, catalog/syllabus navigation and responsive layouts, then removes and verifies the fixtures. Local mode intercepts browser API traffic into the actual handlers; it does not use mock database responses. Evidence is ignored under `artifacts/native-student-services/`.

`pending-fees-rls-live.mjs --preflight` and `credit-load-history-rls-live.mjs --preflight` apply their migrations inside rolled-back validation transactions. They require existing verified owner authorization rather than creating an owner identity. `pending-fees-ui.mjs` and `credit-load-history-ui.mjs` compare measured source geometry and test synthetic admin/privacy/mobile flows. `pending-fees-live.mjs` uses the real client database with two temporary Google-shaped accounts; `NATIVE_ORIGIN=http://127.0.0.1:5184` selects local actual handlers, otherwise it tests the configured production domain. Fixtures and audit/request receipts are removed by exact IDs and absence is verified.

`charge-payment-history-ui.mjs` uses synthetic sign-in and API responses on a loopback Vite server. It checks both pending fee navigation links, inclusive date filters, pagination, reversals, distinct empty and error states, account isolation, signed-out continuation, and responsive tables.

`charge-payment-ledger-concurrency.test.mjs` applies the repository migrations to a generated database on an owner-only scratch PostgreSQL Unix socket. It observes blocking between independent backend PIDs and checks replay, over-cap rejection, and exact in-cap totals. Set `POSTGRES_BIN` to the directory containing `initdb` and `pg_ctl` before running this macOS scratch check.

```sh
umask 077
payment_pg=$(mktemp -d /private/var/tmp/stu100-payment-pg.XXXXXX)
mkdir -m 700 "$payment_pg/socket"
"$POSTGRES_BIN/initdb" -D "$payment_pg/data" --no-locale -U postgres --auth-local=trust --auth-host=reject
"$POSTGRES_BIN/pg_ctl" -D "$payment_pg/data" -l "$payment_pg/server.log" \
  -o "-h '' -k $payment_pg/socket -p 5432 -c unix_socket_permissions=0700" -w start
STU_PAYMENT_TEST_PG_SOCKET="$payment_pg/socket" node --test tests/integration/charge-payment-ledger-concurrency.test.mjs
"$POSTGRES_BIN/pg_ctl" -D "$payment_pg/data" -m fast -w stop
```

`course-selection-ui.mjs` verifies the observed 11-1/11-2 geometry, phase filters, seven-column history, fourteen-period timetable, exclusions, unscheduled records, loading/retry, keyboard scrolling and narrow layouts using synthetic responses. `course-selection-manager-ui.mjs` checks create/edit/clear, stable retry IDs, stale-version recovery and admin accessibility. Both use `PUBLIC_SITE_ORIGIN` (default localhost5184).

`course-selection-rls-live.mjs --preflight` validates migration1000 in a rolled-back client transaction. `NATIVE_ORIGIN=http://127.0.0.1:5184 node tests/integration/course-selection-live.mjs` exercises actual handlers, database writes, two-account isolation, assistant answers and browser views. Omit `NATIVE_ORIGIN` only after deployment to check production. It requires the existing verified owner identity and removes exact fixture records, accounts, audits and receipts; private evidence stays under ignored `artifacts/course-selection/`. Source-inherited contrast exceptions are scoped to measured source colors; they are not a full WCAG pass.

`assistant-public-verification-live.mjs` checks deployed real-model public knowledge/source answers, a synthetic screenshot with known fields, and anonymous personal-record denial. It saves private QA artifacts and uses no account token. Run only against the authorized stu.best production deployment after it is Ready.

Known FAQ and image answers must verify. External founding/OneDrive lookups may instead explicitly withhold unsupported content; this is a safety outcome, not a verified factual answer. Provider failures and timeouts do not pass that acceptance check. All cases run and retain their separate results.

Native academic suites are `academic-grades-live.mjs`, `graduation-review-live.mjs` and `academic-attendance-live.mjs`. Run, for example, `NATIVE_ORIGIN=http://127.0.0.1:5184 node --experimental-strip-types tests/integration/academic-grades-live.mjs` against the configured client database. Local API reads/writes use the actual handlers. Assistant checks default to `local_deterministic`: every question verifies the real caller JWT, reloads that account’s private snapshot and calls the native answer helper with `draftOnly:true`. This checks saved values, filters and isolation; it does not exercise the model or claim model verification.

Add `--live-model` to explicitly exercise the actual local assistant/model (`local_model`). It requires an already configured local `OPENAI_API_KEY` and fails before creating fixtures when the key is absent. Production always calls the deployed API/model (`deployed_model`), regardless of this flag; successful assistant answers must have `verification.status: verified`. Set `NATIVE_ORIGIN=https://stu.best` only after the configured production deployment is ready. Grades and graduation default to the configured production origin if the variable is omitted; attendance requires the origin explicitly. Results identify `assistantMode`, and grades retain mode-tagged synthetic answer artifacts.

These suites create disposable identities/records, verify private reads and literal results, inspect desktop/phone routes, and remove exact fixture records/audits/receipts in `finally`. Run them sequentially under the database lease. Failures and synthetic evidence remain ignored.

The corresponding `*-rls-live.mjs` suites test authorization and validation transactionally. `--preflight` is only for an unapplied migration; it must not be used after that migration is installed. Isolated `*-ui.mjs` suites compare the measured school layout against synthetic data and do not prove real API persistence.

DTM submission helpers and actual private Storage are checked by `dtm-submissions-rls-live.mjs` and `dtm-submissions-storage-live.mjs`; optional `--browser-origin` adds mounted UI flows through the actual handlers. Certificate regression is `enrollment-certificate-rls-live.mjs`, and its synthetic source-layout/route test is `enrollment-certificate-ui.mjs`. Live runs require a serialized lease and exact fixture cleanup. See [submission/certificate acceptance](../../docs/qa/DTM_SUBMISSIONS.md).

`verified-preview.mjs` requires an explicit exact preview origin/revision and verifies a bounded public release manifest before live acceptance resolves credentials or creates fixtures. Protected previews fail closed. The certificate and DTM suites keep preview requests on actual deployed HTTP. DTM deployed mode also verifies administrator review save/replay and student/stale denial through `affairs-manage`; positive administrator browser UI remains separate. Run `node --test tests/integration/verified-preview.test.mjs` and the Storage harness `--self-test` without live credentials.

`assistant-conversation-http-live.mjs` checks exact deployed revision, actual caller JWTs, fresh-browser saved chat reload,40 expanded observed steps and8000 BMP characters, own/cross-account isolation and exact fixture cleanup. Set ASSISTANT_ORIGIN and EXPECTED_RELEASE_REVISION under the serialized lease. It explicitly reports modelAcceptance:false. `assistant-conversation-rls-live.mjs` takes one rollback mode and explicit --expected-migrations/--expected-rls counts; it never permanently applies a migration.

### Protected Preview browser conversation acceptance

Use the separate `--preview-browser` mode of `assistant-conversation-http-live.mjs` for the two signed-in browser turns. It requires the two existing conversation migrations, the exact clean deployed revision, the approved generated Preview origin and the client fixture environment. Put that origin in both `ASSISTANT_ORIGIN` and `APPROVED_PREVIEW_ORIGIN`, and use its complete source SHA in `EXPECTED_RELEASE_REVISION`.

Set `ASSISTANT_PREVIEW_BROWSER_ASSETS` to a fresh output path in an owner-only directory outside the checkout. With the same approved origin and reviewed revision used by the browser operator, derive the allowlist from the deployment before reserving fixtures. Supply the authorized Development OIDC token in the Node environment.

```sh
node --input-type=module - <<'JS'
import {writeFile} from 'node:fs/promises';
import {deriveProtectedConversationBrowserAssets} from './tests/evaluation/protected-conversation-browser-assets.mjs';
import {createPreviewDevelopmentTokenGuard, previewTrustedHeader} from './tests/evaluation/vercel-preview-transport.mjs';

const origin = process.env.ASSISTANT_ORIGIN;
const token = process.env.VERCEL_OIDC_TOKEN;
const assertCurrentToken = createPreviewDevelopmentTokenGuard(token);
const allowedPath = /^\/(?:dtm|release[.]json|assets\/[a-zA-Z0-9_.-]+\.(?:js|css))$/u;
const fetchImpl = (url, init) => {
  const target = new URL(url);
  if (target.origin !== origin || url !== origin + target.pathname || !allowedPath.test(target.pathname)
    || init.method !== 'GET' || init.redirect !== 'error' || init.credentials !== 'omit')
    throw new Error('Unapproved asset discovery request.');
  assertCurrentToken();
  const headers = new Headers(init.headers);
  headers.set(previewTrustedHeader, token);
  return fetch(url, {...init, headers});
};
const result = await deriveProtectedConversationBrowserAssets({
  origin, approvedPreviewOrigin: process.env.APPROVED_PREVIEW_ORIGIN,
  revision: process.env.EXPECTED_RELEASE_REVISION, fetchImpl,
});
await writeFile(process.env.ASSISTANT_PREVIEW_BROWSER_ASSETS,
  JSON.stringify(result) + '\n', {mode: 0o600, flag: 'wx'});
JS
```

The helper checks the release manifest before and after reading the actual DTM shell, then follows static imports and selected DTM and assistant lazy dependencies. It supplies the required known theme files and keeps the default owner-data route `/api/affairs-data`. The browser still checks that the allowed resources work on the live page. The bundle format and selected lazy edges are tied to this DTM flow, so review a changed route or bundler layout before expanding the list.

```sh
node tests/integration/assistant-conversation-http-live.mjs --preview-browser
```

The operator uses the serialized fixture lease and seeds only the verified disposable session in each browser context. It records each reserved conversation before submission, checks the verified answer and Activity against the endpoint SSE, and journals the exact save before relaying it. The two durable saves must agree with both authenticated API and direct SQL readbacks. The second conversation opens first in a fresh context and must issue the server detail GET. Activity expansion and account isolation are checked in the browser before exact fixture cleanup.

Each turn’s browser save and independent HTTP/SQL readbacks are verified before the next question. The private report retains `browserTurnProofs` for verified turns even if a later turn fails. On a denied app request, `browserDenials` records the current phase, fixed endpoint and method, an allowlisted failure code, and HTTP status when available. Logs omit request content, response text, query strings, caller IDs and credentials.

The relay keeps Development OIDC in the Node process, forwards only exact Preview requests, and disables redirects. Supabase Auth continues through the original browser request and carries no Preview credential. The relay buffers a bounded SSE body for Playwright fulfillment. This mode verifies durable Activity after a real endpoint answer and a fresh context. A separate streaming run is required to verify incremental Activity timing.


Production saved-chat acceptance727423ae passed on772ec95:13HTTP/22browser requests,40 expandable observed steps,cache-empty restoration,autosave,sign-out and exact cleanup. The harness waits for verified account UI before opening the assistant; diagnostics contain only endpoint/method/status and synthetic failure views. This is storage/browser acceptance, not a model-quality result.

`student-conduct-workspace-ui.mjs` checks source geometry and phone/desktop behavior with synthetic controlled data on dedicated port5185. `student-conduct-rls-live.mjs` covers rollback-only schema/auth/receipt contracts. `student-conduct-http-live.mjs --self-test` is offline; `--execute` requires the serialized lease and applied130/147 baseline. [Conduct QA](../../docs/qa/STUDENT_CONDUCT.md).

`student-loan-workspace-ui.mjs` compares synthetic source geometry and popup/navigation behavior. The loan SQL and actual-JWT harnesses require a separate live lease and exact baseline; they are not part of an ordinary offline run. [Student Loan QA](../../docs/qa/STUDENT_LOAN.md).

`dorm-conduct-ui.mjs` measures the isolated source-shaped notice. `dormitory-conduct-rls-live.mjs --self-test` and `dormitory-conduct-http-live.mjs --self-test` open no database; explicit live modes require root coordination and exact schema gates. See [Dormitory Conduct QA](../../docs/qa/DORMITORY_CONDUCT.md).

The attendance live acceptance oracle distinguishes explicit semester totals from weekly/monthly-hour claims and still requires the local detail link. A failed saved response stays failed; changing an oracle or publishing a citation repair is not a new real-model pass.

`dtm-dashboard-layout-http-live.mjs` is the guarded actual-JWT acceptance harness for the three built-in DTM dashboard blocks. `node tests/integration/dtm-dashboard-layout-http-live.mjs --self-test` and `node --import tsx --test tests/api/dtm-dashboard-layout-http-contract.test.ts` run offline. Live execution is separate: root must grant the serialized database/release lease, migration `20261113230000` must be applied, and the exact client baseline must be 133 migrations / 150 public RLS tables. With an already running reviewed local server, set `NATIVE_ORIGIN=http://127.0.0.1:5184` and `EXPECTED_SOURCE_REVISION=<reviewed HEAD>`; production uses `NATIVE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION=<deployed revision>`. Then run `node --import tsx tests/integration/dtm-dashboard-layout-http-live.mjs --execute`. Production always calls deployed HTTP; local mode invokes the working-tree handlers with actual synthetic JWTs.

The layout harness creates exactly two Google-shaped student accounts and one non-Google account, never logs in as the protected owner, and tests real overlapping save/save, save/reset and identical retry commands, durable late receipts, direct ACLs, both dashboard aliases, browser configuration/hide/reset/reload, account separation, and 390/320px containment. A reserved physical SQL session holds the shared native/conversation advisory lease. Before-send Auth/action/bootstrap ledgers, retained `.next` scanning, strict receipt reconciliation, exact account cascades, and full protected-owner/unrelated-layout fingerprints gate cleanup. Ambiguous bootstrap requests, unresolved commands, direct-write outcomes or a lost lease retain a recovery ledger instead of claiming cleanup. Private bounded evidence stays under `artifacts/dtm-dashboard-layout/{local,production}-<UUID>/`; no model, university, files, HTML blocks, or existing-account initialization is exercised. Browser acceptance and live cleanup are unverified until the separately authorized run completes.

`education-fund-ui.mjs` checks the standalone Education Fund page, desktop/mobile containment and route behavior using synthetic authentication and blocked external requests. `assistant-presentation-ui.mjs` compares the actual assistant component on native and copied-page hosts, including responsive drawer geometry, reachable composer controls and close/reopen behavior. Both are presentation checks without real account, database or model calls; see their linked QA reports for exact scope.

`credit-load-application-ui.mjs` verifies the observed7-1 closed-period entry, selection index, local navigation and responsive geometry using synthetic authentication and blocked writes. Source prerequisites and limits are in [credit-load QA](../../docs/qa/CREDIT_LOAD_APPLICATION.md).

`dtm-grade-report-rls-live.mjs` is a root-serialized rollback-only migration preflight; `--self-test` never connects. The dedicated grade-report browser/HTTP gates and exact execution prerequisites are maintained in [grade-report QA](../../docs/qa/DTM_GRADE_REPORTS.md).

`dtm-course-content-ui.mjs` checks compiled course section order, exact activity navigation, account isolation, failed/inconsistent pagination and desktop/mobile layout with synthetic responses. Live content persistence is a separate serialized exact-client gate. See [course content QA](../../docs/qa/DTM_COURSE_CONTENT.md).

Moodle URL resource checks: `dtm-course-resource-ui.mjs` renders compiled synthetic sessions; `dtm-course-resource-rls-live.mjs --self-test` is offline. Root-only `--execute --preflight --expected-migrations=135 --expected-rls=152` uses rollback-only DDL with exact recovery evidence. Execution is not implied by the file existing.

Fee-remission verification includes `fee-remission-ui.mjs` for navigation and rendered workflows, `fee-remission-rls-live.mjs` for rollback-only authorization checks, and `fee-remission-http-live.mjs` for exact-client persistence and fixture cleanup. See [fee-remission QA](../../docs/qa/FEE_REMISSION.md).

`exchange-grant-ui.mjs` checks navigation, the local PDF, create/report/delete, retry identity, guest/foreign-account handling and viewport containment. `exchange-grant-rls-live.mjs --rollback-preflight` exercises the migration on the exact client database in a rolled-back transaction. `exchange-grant-http-live.mjs` checks actual-JWT local or deployed routes with disposable fixtures.

`tutor-evaluation-ui.mjs` checks TA and tutor routes with synthetic records. `tutor-evaluation-rls-live.mjs --rollback-preflight` verifies the SQL and exact rollback on the client database. `tutor-evaluation-http-live.mjs` verifies actual-JWT handler or deployed access with disposable fixtures.

`service-leadership-ui.mjs` follows the four local leadership destinations from the compiled index, verifies source geometry and responsive containment, and checks private note and subject routes plus guest sign-in.

The facility repair suites check database authorization, actual-JWT HTTP and the rendered student and administrator flow. See [facility repair QA](../../docs/qa/FACILITY_REPAIR.md).

The summer selection browser and course adjustment database/HTTP summer modes check the new phase and exact-year isolation.

The student profile browser, database and actual-JWT HTTP suites cover 8-1, protected baseline maintenance, retries and status privacy.

Announcement email tests cover source-shaped browser controls, real caller JWT persistence, private queue eligibility and cleanup.

Certificate award suites cover the observed geometry, catalog and form, protected lifecycle, caller-JWT Storage isolation and disposable fixture cleanup.

With the synthetic local Vite environment used by the student payment history test, run `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5309 node tests/integration/charge-payment-manager-ui.mjs`. It opens the real manager route, commits one synthetic entry behind a failed response, replays the same request after reload, then reverses the saved payment. It checks the legacy editor, foreign response rejection, mobile sizing, accessibility and sign-out cleanup.
