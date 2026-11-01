# Project

STU Edu AI combines a public university website with STU Nexus, an authenticated school operations and learning platform. It uses React 19, TypeScript 6, Vite 8, Supabase Auth/Postgres/Storage/Edge Functions, and Vercel Functions. Node.js 24 is required.

## Repository structure

| Path | Purpose |
| --- | --- |
| `src/` | Browser application, platform workspaces, research UI, and database types |
| `api/` | Vercel server endpoints |
| `server/` | Shared authentication, retrieval, evaluation, and operations services |
| `supabase/` | Versioned database migrations, function sources, and database certificate |
| `scripts/` | Build, documentation, migration, and evidence verification tools |
| `tests/` | API contracts, integration, accessibility, and performance checks |
| `public/` | Static assets |
| `docs/` | Operations, product, architecture, design, and research documentation |
| `planning-with-files/` | Single issue-linked work plan, findings, progress, and state |
| `agent/` and `.codex/` | Historical research-evidence manifest and its optional completion hooks |
| `deployment.json` | Non-secret client infrastructure identifiers |

## Runtime boundaries

Supabase RLS and trusted Auth app metadata enforce roles. Browser metadata never grants access. Owner protection, audited transitions, private storage, and confirmation-gated AI actions remain enforced in the database and server. [Permission matrix](src/platform/ROLE_MATRIX.md).

The Marketplace integration names its publishable values `NEXT_PUBLIC_SUPABASE_*`; Vite maps only the URL and publishable key into browser configuration. Database credentials, service keys, and OpenAI keys are never mapped into the browser. [Environment and deployment](docs/operations/SETUP.md).

The `postgres` development dependency powers certificate-verified, serialized database migration and verification commands. All Tiptap packages are pinned to a consistent patched version. PDF parsing uses a patched `pdfjs-dist`. [Scripts](scripts/README.md).

Product requirements and historic research claims are indexed in [docs/README.md](docs/README.md). Historical projects/accounts and measured results are not client credentials or current release evidence.
