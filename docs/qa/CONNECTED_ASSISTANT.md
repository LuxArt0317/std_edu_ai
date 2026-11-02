# Connected Assistant — Issue #82

## Product behavior

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
