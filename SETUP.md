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

The homepage renders without Supabase. `/crm` requires an authorized Supabase staff session in production and falls back to its last local continuity cache only after an authenticated live workspace has been interrupted. If OpenAI is unavailable, Nexus AI returns a clearly labeled grounded local response.

## Supabase CRM Storage

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The production schema has already been applied to `stu_edu_ai`. The migrations in `supabase/migrations` enable RLS on every exposed table, explicit Data API grants, operational indexes, full-text/vector knowledge retrieval, and privacy-minimized AI audit logs.

Assign staff roles through trusted `app_metadata.role` values such as `admin`, `advisor`, `admissions`, or `support`; never use user-editable metadata for authorization. The initial owner credential is stored in the local macOS login keychain as an internet password for `www.stu.best` and is not committed to this repository.

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
```

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
