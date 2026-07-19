# Setup

## Requirements

- Node.js 24
- npm 11 or newer

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

The production schema has already been applied to `stu_edu_ai`. The migrations in `supabase/migrations` enable RLS on every exposed table, explicit Data API grants, academic/CRM indexes, protected assessment answers, role-change audits, versioned onboarding progress, append-only onboarding evidence, full-text/vector knowledge retrieval, and privacy-minimized AI audit logs.

Inline lesson images and videos use the `learning-media` Storage bucket. Section-manager policies restrict authoring uploads; supported lesson media are JPEG, PNG, WebP, GIF, MP4, WebM, and MOV, with a 250 MB video ceiling. Assessment integrity events are append-only and RLS-scoped to the student and authorized class managers.

Nexus message attachments use the private `nexus-attachments` bucket. Files are limited to five per message and supported image, PDF, or bounded text formats; each object is stored under the signed-in user's folder and remains subject to Storage RLS. Pending prompts persist in `nexus_prompt_queue` and are visible only to their owner.

Assign roles with the owner-only People & Roles workspace or the audited `assign_platform_role` RPC. Authorization uses trusted `app_metadata.role`; never use user-editable metadata. The complete role catalog is documented in [src/platform/ROLE_MATRIX.md](./src/platform/ROLE_MATRIX.md).

The protected owner is `winsonbaring10@gmail.com`. A confirmed owner-controlled acceptance identity is provisioned for every canonical role; the complete sign-in directory is in [src/platform/ROLE_ACCOUNTS.md](./src/platform/ROLE_ACCOUNTS.md). Each unique generated credential is stored as a macOS internet password for service `www.stu.best` and the account email. No password is committed to Git.

On the provisioner's Mac, run `npm run export:role-credentials` to verify every live account and atomically generate `PRODUCTION_ROLE_CREDENTIALS.local.md` in the repository root. This local-only POC file is explicitly Git-ignored and restricted to mode `0600`; never upload or paste its contents into GitHub, CI, tickets, or logs.

New non-owner accounts and credential rotations must pass through the deployed owner-only `provision-role-account` Edge Function. Role changes for existing accounts continue through the audited `assign_platform_role` RPC. Neither path can create or transfer the protected owner role.

Student accounts are created from **Academic Office → Students → Add student** by an owner, administrator, or registrar. This creates the confirmed Auth identity and linked SIS/profile records as one guarded workflow. Subjects, terms, class sections, rosters, and schedule events are managed from Academic Office and Schedule; enrollment capacity and timetable collisions are enforced in the database.

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
npm run test:live-academic-operations
npm run test:live-lms
npm run test:live-crm
npm run test:live-roles
npm run test:live-accounts
npm run test:live-account-lifecycle
npm run test:live-nexus-agent
npm run test:live-curriculum
npm run test:live-issue90
npm run test:live-relationships
npm run export:role-credentials
npm run test:live-onboarding
npm run test:live-shell
npm run test:live-ai
```

The `test:live-*` commands require the existing ignored local environment values and network access. They exercise reversible production workflows and clean up test assessment attempts. The curriculum check proves atomic rollback, complete creation, idempotent retry, and cleanup. The relationship check proves exact curriculum-course and prerequisite links, database mismatch rejection, CRM ownership/task invariants, generated campaign recipients, and admissions program snapshots. `test:live-accounts`, `test:live-account-lifecycle`, and `test:live-onboarding` additionally require the provisioner's macOS keychain and never print passwords. The account-lifecycle test temporarily suspends the dedicated student acceptance identity, proves login is blocked, restores it, and confirms login succeeds before exiting. The onboarding acceptance test prints a temporary journey key; remove those temporary progress rows with a trusted operator connection after the run (event rows cascade automatically).

Role onboarding is temporarily disabled. Authenticated portal loads do not mount
the onboarding component, create or update readiness progress, append evidence,
or display the Readiness control and guided overlays. The implementation,
migrations, and existing historical rows remain intact for a reviewed future
re-enable.

Open `http://localhost:5173/crm` during local development to use STU Nexus.

## Portal Recovery

The HTML entry shows a branded boot shell before any application bundle runs. After ten seconds without a successful React mount it changes to an explicit reload message, so missing or blocked JavaScript cannot appear as an empty green screen. React render and lazy-chunk failures show a separate recovery card.

Supabase session restoration, identity validation, sign-in, sign-out, and initial school-data loading all have finite timeouts. If a device has a stale or locked saved session, use **Start with a clean local session** on the loading screen or **Reset this device's saved session** on the sign-in card. This removes only the browser's `stu-nexus-auth` value; it does not delete the Supabase account or school data.

## Preview Production Build

```bash
npm run build
npm run preview
```

Every standard build runs `verify:build` after Vite. The release is rejected if the generated CRM route graph does not include a stylesheet containing the authentication-shell and card selectors. The preview HTML for both `/` and `/crm` must contain `data-stu-boot`; `npm test` enforces the source contract automatically.

## Diagnose Production Rendering

```bash
npm run diagnose:production
```

This read-only command checks `https://www.stu.best` by default. It recursively
fetches the generated assets for `/` and `/crm`, then requires the recovery shell,
semantic CRM authentication stylesheet, and absence of onboarding UI markers. Set
`STU_BASE_URL` to diagnose a different public deployment. A missing-style failure
explicitly reports that the portal can return HTTP 200 while showing an unstyled
sign-in form.

## Deploy to Vercel

Vercel auto-detects Vite and uses its standard framework settings for dependency
installation, the `build` script, and the build output directory. Node.js 24 is
selected through the major-only `engines` entry in `package.json`. The minimal
`vercel.json` contains no build overrides; it keeps only the rewrite required for
client-side routes such as `/crm` to work when opened directly.

Connect this repository to a Vercel project and deploy the `main` branch. Add
the server-only OpenAI key and browser-safe Supabase values in Vercel project
settings. Never place the OpenAI key in a `VITE_*` variable.
