# Setup

## Requirements

- Node.js 22
- npm 10 or newer

## Install

```bash
npm ci
```

## Environment

Create an ignored `.env.local` file for server-only AI configuration:

```bash
OPENAI_API_KEY=your-server-side-key
OPENAI_MODEL=gpt-5.6-terra
SAFETY_HASH_SALT=a-long-random-value
```

`OPENAI_API_KEY` must never use the `VITE_` prefix and must also be configured in the Vercel project for the deployed AI endpoint. `OPENAI_MODEL` and `SAFETY_HASH_SALT` are optional.

For Supabase, configure these browser-safe variables locally and in Vercel:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The homepage renders without Supabase. `/crm` requires an authorized Supabase session. School OS data is always loaded live through RLS; the legacy CRM retains an explicit continuity cache for interrupted authenticated sessions. If OpenAI is unavailable, Nexus AI returns a clearly labeled grounded continuity response and never silently fabricates a successful scan.

## Supabase School Platform

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The production schema has already been applied to `stu_edu_ai`. The migrations in `supabase/migrations` enable RLS on every exposed table, explicit Data API grants, academic/CRM indexes, protected assessment answers, role-change audits, full-text/vector knowledge retrieval, and privacy-minimized AI audit logs.

Assign roles with the owner-only People & Roles workspace or the audited `assign_platform_role` RPC. Authorization uses trusted `app_metadata.role`; never use user-editable metadata. The complete role catalog is documented in [src/platform/ROLE_MATRIX.md](./src/platform/ROLE_MATRIX.md).

The protected owner is `winsonbaring10@gmail.com`. Validation identities for faculty and student views use `winsonbaring10+faculty@gmail.com` and `winsonbaring10+student@gmail.com`. Their generated credentials are stored as internet passwords in the local macOS login keychain for `www.stu.best`; no password is committed or documented in plaintext.

The homepage currently references official public STU media assets from `www.stu.edu.tw`. An internet connection is required to load those images and the Roboto web font during local development.

## Run Locally

```bash
npm run dev
```

The Vite dev server will print a local URL, usually `http://localhost:5173`.

## Build

```bash
npm run build
```

## Test

```bash
npm test
npm run test:live-school
npm run test:live-crm
npm run test:live-roles
npm run test:live-ai
```

The `test:live-*` commands require the existing ignored `.env.local` values and network access. They exercise reversible production workflows and clean up test assessment attempts.

Open `http://localhost:5173/crm` during local development to use STU Nexus.

## Preview Production Build

```bash
npm run preview
```

## Deploy to Vercel

Vercel reads `vercel.json`, installs the locked dependencies with `npm ci`, runs
`npm run vercel-build`, and publishes `dist`. Node.js 22 is pinned through the
`engines` field in `package.json`. The rewrite rule keeps client-side routes
working when opened directly.

Connect this repository to a Vercel project and deploy the `main` branch. Add
the server-only OpenAI key and browser-safe Supabase values in Vercel project
settings. Never place the OpenAI key in a `VITE_*` variable.
