# Connected Assistant — Issues #82 and #83

## Current identity boundary — Issue #83 (supersedes the original public identity routing)

School Affairs provides the future student authentication/data boundary. STU Nexus is the separate knowledge manager. Public chat never reads the Nexus Supabase session or sends its token; being signed into Nexus cannot enable private student answers. The manager's explicit answer-test control still uses authenticated knowledge permissions. The protected Lux owner starts at `/app/knowledge` with a single Knowledge navigation item and a Knowledge manager label; an explicit account-menu option opens the existing full owner workspace. This is a presentation/default-route change, not an owner-role downgrade.

`/school-affairs`, `/school-affairs/login`, `/school-affairs/signed-out` and `/ePortal/login.asp` show the reconstructed logged-out entry unless the user explicitly opens the demo. It uses observed public logo/background/gym/campus assets and local manual photo controls. Real account/password/CAPTCHA inputs are disabled; a clearly labeled DEMO graphic is not a live challenge. The preview flag expires after thirty minutes, has no server authority, clears on exit, and leaves Nexus sessions untouched. Private deep links cannot bypass the entry after logout. Browser storage failure falls back to in-memory demo navigation.

The initial corpus remains 22 published documents/67 chunks, now 19 public references/58 chunks and 3 staff-only Nexus guides/9 chunks. The public navigation guide explicitly separates School Affairs from knowledge management. Revised versions were ingested/reviewed/published; earlier versions remain historical. No new schema or authentication-policy change was made.

The real School Affairs account integration remains pending a user decision: school-approved login/API versus independent website student accounts. Neither official browser login nor a demo UI flag is silently converted to student authority. This required clarification does not block the corrected public UI and knowledge-manager default. Issue #83 remains open for that integration decision.

Checks: `npm run test:school-affairs-entry` (five widths, source assets, disabled credential controls, menu/help/photo behavior, logout/deep-link guard and preserved Nexus state), `npm run test:school-affairs` (existing portal navigation/layout), and connected Assistant E2E (public chat remains public despite a real owner session; Lux manager landing/full-workspace escape). Existing #82 test evidence below is historical where it describes automatic public Nexus identity.

## Original Issue #82 behavior (identity routing superseded above)

The public Assistant is a shared shadcn sheet on the homepage, student directory, School Affairs preview and school SSO preview. It supports English/Traditional Chinese, conversation follow-ups, safe Markdown, source links, feedback, keyboard sending, Escape and focus restoration. It uses the same colors as the app. Signing in changes the request to authenticated QA; starting a new conversation or changing accounts clears the browser's transcript. The workspace Assistant retains its confirmation-gated action loop.

Anonymous questions use only eligible public documents. Personal questions such as “What are my current subjects?” require sign-in. Signed-in questions load identity and authorized records on the server using the caller's JWT and the publishable database key. Browser context contains only the view; posted course, student and knowledge facts cannot become authoritative. Inactive/mismatched roles are rejected. No service-role fallback is used for retrieval or account context.

Server context includes visible academic catalogs, assigned/enrolled sections, materials and pages, assessment metadata (never answer keys), published student grades, attendance, schedules, current announcements, tasks, service requests, communications, initiatives and admissions/campaign summaries. Personal course/schedule/task/announcement lists are explicitly separated from the broader visible catalog. Initial reads are bounded to 100 records per collection, with bounded exact-ID lookups for linked course/term names; unavailable and truncated collections are explicit and must not be described as complete or empty. External university records remain unavailable until a real authorized integration exists.

## Retrieval and management

Public and authenticated answers share embedding/keyword retrieval. The internal RPC is a security invoker using caller RLS plus explicit publication, normalized extraction, active-source, effective/expiry/review-date and audience filters, even for managers. Assigned teachers can read published class knowledge for their authorized classes. Anonymous search retains a separately filtered public-only function. Ranking uses meaningful keyword/vector matches, OR query terms, bilingual office/service aliases and at most two chunks per document. An embedding failure can fall back to eligible keyword results; it never widens permissions.

Public answer citations are validated against retrieved chunk IDs; malformed or fabricated references reject the response. Signed-in knowledge citations are resolved to actual retrieved sources and linked in the workspace. Public conversation history helps resolve follow-ups but never becomes evidence or authorization. Raw HTML/images from model output are disabled. Public answers are content-minimized in the existing trace/feedback system; private QA uses no public feedback trace. Provider storage is disabled.

At `/app/knowledge`, owner/admin/librarian users can register sources, ingest URL/text/Markdown/PDF, select public/institution/staff/role/class audiences, review chunks and source dates, publish, reject/quarantine, roll back and test an answer. Refreshing an allowed URL produces a reviewable version; changed content does not silently replace a published version. Manual captured sources prohibit automated URL acquisition. Published references carry expiry/review dates; ongoing source ownership and review remain operational responsibilities.

## Initial corpus and limits

[The versioned corpus](../research/assistant-corpus.v1.json) contains 22 references across eight domains: general school contact, all seven student-service sections (72 entries), admissions pathways, registrar/services contacts, fee/aid/housing contacts, academic FAQ, five dated news categories and app/student/teacher/knowledge guides. It distinguishes official school destinations from the client app's demo School Affairs/SSO interface.

Public source pages intermittently fail DNS or HTTP 403. Existing official browser captures dated November 2 and explicitly labeled official search-index excerpts observed November 3 were used; indexed pages report older crawl dates. Import is a client-authorized reference review, not institutional endorsement or a complete/verified-current school policy corpus. News is headline-only, not a live feed or full notice/attachment corpus. No actual student names, grades, credentials or signed SAML/session URLs were imported. Do not claim perfect recall or answers to unavailable facts.

Dates use Asia/Taipei midnight, not UTC midnight. The importer is target-guarded and restartable, uses the existing authenticated ingestion/publish workflow and saves only ignored non-secret result IDs. It preserves extraction provenance and audits capture-timezone corrections. A dry run makes no changes.

## Verification

- `npm test`: API/source and functional context/retrieval security checks.
- `npm run test:unit`: Markdown security and role/class form rendering/serialization.
- `npm run test:e2e`: authenticated workflows across fourteen roles, plus the connected-Assistant scenarios.
- `npx playwright test tests/e2e/connected-assistant.spec.ts`: twelve public page/viewport states, follow-up/citation behavior, signed-in endpoint selection, live caller-context isolation, public/staff/role/class/draft/expiry/review-due retrieval matrix and a confirmed two-step teacher goal against real disposable database records.
- `npm run test:live-connected-assistant`: real production public citations, role-scoped subjects/announcements, forged-context rejection, unsaved teacher proposals and blocked student assessed-work actions, using disposable role fixtures with cleanup.
- `npm run test:accessibility-public`: ten public chat/campus/study states with controlled API fixtures.
- `npm run build`, `npm run lint`, `npm run verify:handoff`, `npm run verify:dependency-audit`, `npm run verify:client`.
- `node scripts/import-assistant-corpus.mjs`: validate the dated manifest and show the target/coverage; add `--apply` only for an authorized import/review.

Live acceptance must verify the actual deployed API, signed-in student subjects/announcements, public contacts, source citations, forbidden mutations and cleanup. Automated cases are regression evidence, not an independently reviewed research gold set or human accessibility study. Release evidence/status is maintained in [the handoff](../operations/HANDOFF.md) and the single planning state.

## Local release checkpoint — November 3, 2026

179 API/source checks and 26 units pass, along with build/assets, lint (inherited warnings), handoff links and zero dependency vulnerabilities. The existing browser suite passed 44/45 initially; its arbitrary-assessment selector was replaced with a dedicated quiz fixture and the focused rerun passed. All five connected-Assistant scenarios plus that regression passed together (6/6). Public chat covers twelve page/viewport combinations; ten public accessibility states pass with no serious/critical automated findings. The teacher two-step draft workflow saves real records only after each confirmation and verifies student draft isolation. Source fixtures and disposable accounts are cleaned after each run.

Three additive retrieval migrations are applied (106 total; 101 RLS tables). These checks are local/pre-release evidence; deployed API/model acceptance is recorded separately in the handoff after publication.

Additional live database verification passes student/teacher/owner context and the complete audience matrix after all three migrations, including SIS-only roster linkage. Pre-release client verification passes owner login/profile, 106 migrations, RLS, CRUD cleanup, Edge Functions and deployed baseline OpenAI QA.

Deployed-model acceptance at `https://stu.best` passes ten checks: four public sourced questions, anonymous personal-data handoff, student enrolled subject, faculty teaching assignment, student class-announcement body, unsaved teacher draft proposal and forbidden student assessed-work action. Real model responses use server-RLS grounding and ignore forged browser records. The corpus contains 22 published references / 67 searchable chunks. A production visual review also found the preview banner overlapping the Assistant header; the public page now establishes its own stacking context, with twelve-state hit-testing of the title/close control added.

The strengthened twelve-state public hit-test/follow-up/Escape check passes after waiting for the normal Sheet opening animation; all ten public accessibility states pass again. The UI follow-up changes stacking only; deployed-model/API behavior is unchanged.

Final header inset/composer sizing also passes the twelve-state public regression. The latest live SQL cleanup audit reports one real owner, zero QA profiles and zero orphan auth identities. Deployment/CI identifiers and the final source commit are recorded on Issue #82; earlier runtime IDs above describe the corresponding verified checkpoint.

Issue #83 release verification: runtime 560b9fd / Vercel 6FijU2pyfjGRGLSVnfZiArEJk5gt Ready; quality 41501070723 passed. Seven production routes/50 assets, real public School Affairs handoff/registrar answer, browser demo entry/logout and anonymous exclusion of all three internal guide IDs pass. The private student-auth integration remains pending the unanswered user choice.
