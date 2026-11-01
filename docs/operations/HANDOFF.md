# Client handoff

## Alerts and nested UI follow-up — Issue #75

Plan opens a usable shadcn sheet with editable requests, independent student context, Escape/close/focus restoration and cancellation of obsolete responses. Nested student assistants dismiss one layer at a time. Remaining preview/research/workload headers and upload/badge text use readable semantic colors. Alert and populated task rows fit desktop/mobile; quiz options, notifications and grade-upload keyboard access are corrected. The service table stays within the viewport and scrolls with keyboard input.

Local verification: all 43 browser scenarios across full/focused runs (41/42 then 7/7 after the task fix), 170 API/source checks, 13 units, 48 expanded nested visual/theme/viewport states and ten public accessibility states. No serious/critical accessibility failures, horizontal overflow or app errors in the expanded audit. Real authenticated CRM OpenAI plan and client backend checks pass. Fixture cleanup leaves one protected owner, no QA/orphan identities and unchanged 101 migrations/101 RLS tables. Production verification is pending the release below; earlier deployments do not prove these follow-up fixes.

## Current UI/auth fixes — Issue #75

Canonical `/signin` and public student `/signup` are implemented in a separate auth feature. `/login` and `/crm` remain compatibility entries; `/app` is protected. Registration supports confirmation status, resend and correcting an email. Student-only trusted server metadata and email verification preserve staff/owner access boundaries. New-password UI/service checks match the provider length/character policy.

Fixed reported dark-header text, academic selector overlap, class action/metric layout collisions, unnamed enrollment status controls and mobile task overflow. Quiz preview uses the shared shadcn sheet with an accessible title and focus handling. Readability verification covers 100 unique desktop/mobile/theme states across the original sweep, targeted regressions and auth screens.

Local evidence: 170 API/source checks, 13 units, all 38 E2E scenarios across full/focused runs (36/36 full, five targeted checks, then the extended registration/confirmation/sign-out checks). Real public signup requires email verification; forged owner/admin user metadata and profile-role edits do not elevate access. Provider settings enforce strong 16-character minimum passwords; 72-byte maximum is handled without truncation. Database: 101 migrations / 101 public RLS tables. Exact `/signin` callbacks verified for production and the two local origins; legacy production `/crm` retained.

Published and verified: code `fa01a84c2df45bc78811334eee8e9ebac5cc438e`, Vercel `751pwPAFk66kfybEqVgg7zGPPMEU` Ready, GitHub quality workflow `41325153100` successful. Live owner login, direct links/history/refresh, legacy redirect, canonical signin/signup mobile accessibility and zero app errors passed. All seven entry paths resolve 26 recursive assets; live API/RLS/storage/Edge Function/OpenAI checks passed. Local desktop signin Lighthouse: performance 98, accessibility 100, LCP 0.5s, CLS 0.071. Custom SMTP remains an explicit external dependency: default provider mail accepted the QA request, but inbox delivery and production mail capacity are not claimed. User chose to keep Supabase Auth/default delivery after discussing Gmail. Public email delivery remains limited to approved team addresses and two emails/hour until a production sender is connected. Issue #75 remains open for that dependency.


## Previous release — Issue #74

User authorized production publication on 2026-11-01. The release contains the unified transactional school UI and separate `/login` and protected `/app` section routes. Old `/crm` links and the existing provider recovery callback remain compatible; server authorization and database permissions are unchanged.

Pre-release verification passed: 170 API/source checks, 11 units, all 32 browser scenarios across full/focused runs, ten public accessibility states, build/assets, documentation links and zero dependency vulnerabilities. Lint passes with inherited React warnings. Live client checks cover owner CRUD cleanup, RLS/private storage, both account functions and OpenAI-backed non-mutating QA. See the [workflow audit](../qa/WORKFLOW_AUDIT.md).

Production is Ready at [stdeduai.vercel.app](https://stdeduai.vercel.app): [deployment 8VJNpQEEaUR3gVMyFfQ5hj4DzqSD](https://vercel.com/v1-d286/std_edu_ai/8VJNpQEEaUR3gVMyFfQ5hj4DzqSD), code commit `64ebf127263e9335a4b5e370c7e6f19e5f90924e`. Independent GitHub quality workflow `41321537236` passed all stages. Live browser checks passed real owner sign-in/return navigation, protected sections, refresh/back, legacy redirect, missing-page and external-return rejection, dashboard and mobile-login accessibility with zero app errors. Production shell checks verified 27 recursive assets for each of five entry paths; live APIs, private storage/RLS, owner CRUD cleanup, both Edge Functions and authenticated OpenAI QA passed. Previous local-review notes below are historical. Credentials remain private and ignored. Email delivery, institutional approvals and manual assistive-technology acceptance are not claimed by these automated checks.


## Prior local UI checkpoint (Issue #74)

The requested taste-led redesign replaces the merged workspace's promotional presentation with compact transactional screens. Shared shadcn controls and one green accent cover grouped navigation, compact page headers, real case/department tables, academic Add/Export menus, collapsed diagnostics and plain action labels. Account-menu options include System/Light/Dark appearance, owner role preview and sign-out. Permissions, routes, data and approval controls remain intact.

Verified: 170 API/source checks; eight units; all 29 E2E scenarios across a full run and focused regressions (23/27 initially, then final 6/6 for revised checks/new interactions); 30 Light/Dark page accessibility states; ten public accessibility states; build/assets; docs/links; zero dependency vulnerabilities. All 14 roles and real curriculum/LMS/CRUD/support flows passed. Lighthouse sign-in desktop: performance 98, accessibility 100, LCP 0.7s, CLS 0. Lint passes with inherited React warnings. Full evidence: [workflow audit](../qa/WORKFLOW_AUDIT.md).

Final fixture cleanup and independent SQL confirm one real owner, zero QA/test-named users and no orphaned identities. Database unchanged during this redesign: 100 migrations / 101 public RLS tables. Credentials and authenticated artifacts remain ignored/private.

At this earlier checkpoint the UI was local-only. The current release above supersedes that status. Institutional approvals, email delivery and manual assistive-technology acceptance are not asserted by automated checks.

## Previous deployed handoff — Issue #73

Tracked by [Issue #73](https://github.com/LuxArt0317/std_edu_ai/issues/73).

## Verified setup

- Private client repository and copied issue tracker exist (12 original open, 60 original closed issues; Issue #73 tracks this setup separately).
- Vercel production project is connected to `LuxArt0317/std_edu_ai`, branch `main`.
- The connected Supabase resource is `xiftudmvxphxcjtmfmib`, accessed through client Vercel Marketplace SSO.
- The client owner email is explicitly confirmed as `luxart0317@gmail.com`.
- Product/design/research documents are organized under `docs/`; a single plan lives in `planning-with-files/`.
- Secret files and issue-migration exports are excluded from the deliverable. Original role policies remain enforced.

## Release verification

- Database: 96 migrations applied with recorded history; 100 public tables have RLS.
- Authentication: confirmed owner login/profile and protected-owner metadata.
- Storage: institutional-media, learning-media, lms-files, and nexus-attachments exist; private buckets remain private.
- Authorization/data: four protected tables expose no anonymous rows; owner department create/update/delete verified with zero remaining fixture.
- Edge Functions: both deployed; exact client CORS, unauthenticated denials, and owner account-directory call passed.
- Auth URL: production site URL and exact /crm redirect configured in the dashboard.
- Local checks: 170 tests pass, TypeScript/build/assets pass, documentation links pass, dependency audit reports zero vulnerabilities. Lint exits successfully with inherited React warnings; Vite reports a large-chunk advisory.
- Client deployment: Vercel release `Aw8nC9DBjH5uW7pdi4F2oaLe2S5M` is Ready for commit `400a1f0`. Both `/` and `/crm` return HTTP 200 with the expected client Supabase hostname and all 8 recursively checked assets.
- Browser acceptance: signed into the deployed owner portal and verified Academic Office loads real client database records.
- Live API: campus directory returns HTTP 200; school AI rejects unauthenticated requests with HTTP 401 and returns HTTP 200 with `source: openai` for the authenticated owner in non-mutating QA mode.
- Email delivery, real client data import, additional named users, institutional research review, and physical-campus validation were not claimed as verified.

## Client administration

The initial client owner credential, if generated by setup, is stored locally in the ignored `.env.owner.local` file with owner-only permissions. It is not included in Git or this document. Use the client Supabase Auth workflow to manage the owner account and recovery. Never share developer sessions or provider tokens with the client.

Only the client owner is provisioned by default. Create additional staff/student identities through the governed application workflows once their Edge Functions are deployed. The historical 14-account directory describes an earlier acceptance environment and must not be used as a client sign-in directory.

AI requires the client's server-only OpenAI API key. Research protocols, official corpus review, physical campus validation, participant studies, and institutional sign-off remain external research deliverables; sample data and inherited reports do not establish their completion.
