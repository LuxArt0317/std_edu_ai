# Project

STU Edu AI combines a public university website with STU Nexus, an authenticated school operations and learning platform. It uses React 19, TypeScript 6, Vite 8, Supabase Auth/Postgres/Storage/Edge Functions, and Vercel Functions. Node.js 24 is required.

## Repository structure

| Path | Purpose |
| --- | --- |
| `src/features/` | Auth, school, CRM, curriculum, research, and public product modules |
| `src/features/public/affairs/` | Source-preserving School Affairs portal, 57-row/94-link student program catalog and local preview preferences |
| `src/features/public/site/` | Source-faithful public homepage/student directory, static source catalogues and inert mySTU SSO preview |
| `src/features/auth/` | Sign-in, student signup, session guards and shared password policy |
| `src/features/school/portal/` | Separate home, people, assessment, grade, calendar and assistant views |
| `src/components/ui/` | Official shadcn/ui source primitives |
| `src/components/`, `src/lib/`, `src/hooks/` | Shared form adapters, interactions, utilities and hooks |
| `src/styles/` | Tailwind v4 semantic brand tokens and shared component styling |
| `api/` | Vercel server endpoints |
| `server/` | Shared authentication, retrieval, evaluation, and operations services |
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

Uses the official shadcn/ui component sources, Tailwind v4 via @tailwindcss/vite, Radix primitives, and shared semantic brand tokens. Component/unit and browser E2E checks use Testing Library and Playwright. Documentation is centralized under docs/; runtime and test folders contain no Markdown. Legacy specialized layouts remain in feature CSS within a lower-priority cascade layer, while the shared controls, dialogs, navigation, tabs and theme use shadcn/ui and Tailwind.

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

The shared public chat, server-loaded account context and governed public/internal retrieval are documented in [Connected Assistant](docs/qa/CONNECTED_ASSISTANT.md). The dated initial corpus is versioned under `docs/research/`; account records and provider credentials are never bundled into that corpus.
