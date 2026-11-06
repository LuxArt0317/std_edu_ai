# Project

STU Edu AI combines a public university website with STU Nexus, an authenticated school operations and learning platform. It uses React 19, TypeScript 6, Vite 8, Supabase Auth/Postgres/Storage/Edge Functions, and Vercel Functions. Node.js 24 is required.

## Repository structure

| Path | Purpose |
| --- | --- |
| `src/features/` | Auth, school, CRM, curriculum, research, and public product modules |
| `src/features/public/affairs/` | Source-preserving School Affairs portal, isolated Google PKCE accounts, captured 94-service directory, sample account records and owner record management |
| `src/features/public/dtm/` | Digital Teaching Materials login, sample course and assignment preview using the School Affairs Google session |
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

The GitHub quality workflow runs the safe, non-mutating checks without client credentials. Live E2E QA uses isolated client fixtures and keeps sessions/traces in ignored local artifacts. Playwright packages share the same version. The rich editor is loaded separately; no JavaScript chunk exceeds the default 500 kB build advisory threshold in the current build.

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

The DTM preview reuses that Google session. A dedicated three-table `dtm_*` schema stores account-scoped sample courses and materials under RLS; public copied pages show a verified sign-in indicator through a same-origin account-status frame. The private assistant may read the signed-in account's School Affairs and DTM preview records, but no official university Moodle records are connected. [DTM details](src/features/public/dtm/README.md).

The campus assistant streams server-observed directory, knowledge, web, image and account lookup activity to an expandable timeline attached to each answer. A bounded, identity-scoped transcript persists within the current browser tab across navigation and refresh; sign-out and New chat clear it. Image bytes, auth tokens and unconfirmed action capabilities are not persisted. The UI does not expose private model reasoning. Public and School Affairs answers retain separate authorization, and site actions still require user confirmation.
