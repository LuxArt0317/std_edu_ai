# Project

STU Edu AI combines a public university website with STU Nexus, an authenticated school operations and learning platform. It uses React 19, TypeScript 6, Vite 8, Supabase Auth/Postgres/Storage/Edge Functions, and Vercel Functions. Node.js 24 is required. The campus answer-verification workflow uses `@langchain/langgraph` and `@langchain/core` in the Node backend.

## Repository structure

| Path | Purpose |
| --- | --- |
| `src/features/` | Auth, school, CRM, curriculum, research, and public product modules |
| `src/features/public/affairs/` | Source-preserving School Affairs portal, isolated Google PKCE accounts, captured 94-service directory, sample account records and owner record management |
| `src/features/public/dtm/` | Digital Teaching Materials, native course resources, grade reports and submissions using the shared School Affairs Google session |
| `src/features/public/site/` | Public reference catalogues, preview disclosure and inert mySTU SSO preview |
| `src/features/public/mirror/` | Inert source-page renderer, local routing policy and versioned page/asset/coverage manifests |
| `src/features/auth/` | Sign-in, student signup, session guards and shared password policy |
| `src/features/school/portal/` | Separate home, people, assessment, grade, calendar and assistant views |
| `src/components/ui/` | Official shadcn/ui source primitives |
| `src/components/`, `src/lib/`, `src/hooks/` | Shared form adapters, interactions, utilities and hooks |
| `src/styles/` | Tailwind v4 semantic brand tokens and shared component styling |
| `api/` | Vercel server endpoints; [public, School Affairs and Nexus boundaries](api/README.md) |
| `server/` | Shared authentication, retrieval, evaluation, and [School Affairs directory services](server/README.md) |
| `supabase/` | Versioned database migrations, function sources, and database certificate |
| `scripts/` | Build, documentation, migration, and evidence verification tools |
| `tests/` | API contracts, integration, accessibility, and performance checks |
| `public/` | Static assets |
| `media/tutorials/` | Isolated Remotion/ElevenLabs video-guide tooling; excluded from app runtime |
| `docs/` | Operations, product, architecture, design, and research documentation |
| `planning-with-files/` | Single issue-linked work plan, findings, progress, and state |
| `agent/` and `.codex/` | Historical research-evidence manifest and its optional completion hooks |
| `deployment.json` | Non-secret client infrastructure identifiers |

## Runtime boundaries

Supabase RLS and trusted Auth app metadata enforce roles. Browser metadata never grants access. Owner protection, audited transitions, private storage, and confirmation-gated AI actions remain enforced in the database and server. [Permission matrix](docs/security/roles.md).

The Marketplace integration names its publishable values `NEXT_PUBLIC_SUPABASE_*`; Vite maps only the URL and publishable key into browser configuration. Database credentials, service keys, and OpenAI keys are never mapped into the browser. [Environment and deployment](docs/operations/SETUP.md).

The `postgres` development dependency powers certificate-verified, serialized database migration and verification commands. All Tiptap packages are pinned to a consistent patched version. PDF parsing uses a patched `pdfjs-dist`. [Scripts](docs/reference/TOOLING.md#scripts).

Product requirements and historic research claims are indexed in [docs/README.md](docs/README.md). Historical projects/accounts and measured results are not client credentials or current release evidence.

## Design system and verification — Issue #74

Uses the official shadcn/ui component sources, Tailwind v4 via @tailwindcss/vite, Radix primitives, and shared semantic brand tokens. Component/unit and browser E2E checks use Testing Library and Playwright. Detailed documentation is centralized under docs/; touched runtime and test folders have short purpose READMEs. Legacy specialized layouts remain in feature CSS within a lower-priority cascade layer, while the shared controls, dialogs, navigation, tabs and theme use shadcn/ui and Tailwind.

The GitHub quality workflow runs the safe, non-mutating checks without client credentials. Production builds explicitly type-check Vercel API entrypoints as well as the frontend; see [build verification](docs/operations/SETUP.md). Live E2E QA uses isolated client fixtures and keeps sessions/traces in ignored local artifacts. Playwright packages share the same version. The rich editor is loaded separately; no JavaScript chunk exceeds the default 500 kB build advisory threshold in the current build.

## Unified School OS

One sidebar/header owns navigation for school and student-service features. See the [frontend reference](docs/reference/FRONTEND.md) and [workspace guide](docs/guides/portal.md). Account records and advanced role templates are presented separately; server authorization remains unchanged.

## Transactional UI

The taste-led overhaul keeps the existing shadcn/Radix and Tailwind stack, adds the official shadcn dropdown menu, and uses the existing next-themes provider for system/light/dark appearance. The application uses compact page headers, grouped navigation, plain labels and record-focused screens. See the [frontend reference](docs/reference/FRONTEND.md).

## Browser routing

React Router 8 owns authenticated navigation: `/signin` is the sign-in and password screen, `/app` is the overview, and `/app/<section>` supports direct links and browser history. `/crm` remains a compatibility entry for old links and old Supabase recovery links. New confirmation/recovery links use `/signin`.

## Narrated video guides

The isolated [media package](media/tutorials/PROJECT.md) adds Remotion 4.0.539 rendering and narration/caption tooling without changing application dependencies. [Video setup](media/tutorials/SETUP.md) covers private credential storage, synthetic role recordings, rendering and cleanup.

Assistant replies use `react-markdown` with raw HTML and remote images disabled, safe links, and semantic text/list formatting. Video guides load signed delivery assets from the private client tutorial bucket; rendering and provider credentials remain outside the application bundle.

## Connected Assistant

The shared public chat, server-loaded account context and governed public/internal retrieval are documented in [Connected Assistant](docs/qa/CONNECTED_ASSISTANT.md). Missing or current public school details can use [bounded official/broader web search](docs/qa/SCHOOL_ASSISTANT_SEARCH.md), with real source citations and private-account isolation. The dated initial corpus is versioned under `docs/research/`; account records and provider credentials are never bundled into that corpus.

School Affairs and knowledge management have separate identity boundaries. Public chat does not inherit a Nexus session; Lux defaults to the management workspace while protected owner permissions remain intact. [Current behavior and integration boundary](docs/qa/CONNECTED_ASSISTANT.md).

## Public page copies — Issue #84

Public pages use isolated, source-preserving local HTML/CSS with trusted navigation controls. Large documents are restored from the reviewed, checksum-pinned multipart bundle in `vendor/school-documents/` at build/dev startup; source styles, fonts and images remain versioned. Packing/restoring requires system `tar` with gzip (standard macOS/Linux build images); no source-server request or new npm dependency is required. The verified campus-directory API/UI remains available independently of the source iframe. No new runtime dependency was added. See [coverage, architecture, setup and QA](docs/qa/SCHOOL_MIRROR.md).

School Affairs Google authentication and its release/provider acceptance are documented in [Google School Affairs sign-in](docs/qa/GOOGLE_SCHOOL_SIGNIN.md). It uses a separate session from Nexus and the existing server/RLS authorization; Google credentials remain in Supabase provider settings. No new npm dependency is required.

The DTM workspace reuses that Google session and stores private course, material, submission and grade-report records under RLS. The floating public account-status panel has been removed. Existing assistant access remains account-scoped; literal report integration is tracked separately while Issue100 is paused. No official university Moodle synchronization is claimed. [DTM details](src/features/public/dtm/README.md).

The campus assistant streams server-observed directory, knowledge, web, image and account lookup activity to an expandable timeline attached to each answer. A bounded, identity-scoped transcript persists within the current browser tab across navigation and refresh; sign-out and New chat clear it. Image bytes, auth tokens and unconfirmed action capabilities are not persisted. The UI does not expose private model reasoning. Public and School Affairs answers retain separate authorization, and site actions still require user confirmation.

Moodle course content placement is managed separately from activity records and submission state; [course content QA](docs/qa/DTM_COURSE_CONTENT.md) documents the additive schema, access boundaries and verification.

Local frontend/API execution for manual agent review is documented in [operations setup](docs/operations/SETUP.md#manual-local-agent-review).

## Local evaluation workspace

[Answer Lab](tools/evaluation-lab/README.md) provides standalone reference editing, model comparisons and persistent local assistant run history. See its [setup](tools/evaluation-lab/SETUP.md).

Answer Lab is included in the multi-entry Vite build at `/evaluation-lab`, with hosted data operations multiplexed through the existing affairs-data Function. See [hosted setup](tools/evaluation-lab/SETUP.md) and [storage/security](tools/evaluation-lab/README.md).

Local chatbot task strategies and verified public-source imports are documented in [server architecture](server/README.md) and the [answer strategy review](docs/guides/CHATBOT_ANSWER_STRATEGY_REVIEW.md).

The canonical spreadsheet-based evaluation reference is [School questions and answers](docs/question-answer/README.md); the local lab versions references while preserving prior runs. See [lab architecture](tools/evaluation-lab/README.md).

Local chatbot slash settings, model catalog and request-scoped overrides are described in [server documentation](server/README.md), [public UI documentation](src/features/public/README.md) and [Answer Lab documentation](tools/evaluation-lab/README.md). No new dependency was added.

The local assistant source coverage and independent-auditor configuration are documented in [server helpers](server/README.md); public source projections and their refresh commands are in [server data](server/data/README.md).

The application API catalog, adaptive tool loop and reviewed actions share actual endpoint handlers. See [server architecture](server/README.md#automatic-application-api-tools-issue-104). No new dependencies were added.

The chatbot now has a shared request-scoped LangGraph for website/API discovery, source reads, coverage review and answer verification. It reuses installed LangGraph/Cheerio; no dependencies were added. See [server architecture](server/README.md#unified-websitedatabase-discovery-issue-108).
