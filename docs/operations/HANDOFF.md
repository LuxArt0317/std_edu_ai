# Client handoff

## Current production domain — Issue #81

The current public/School Affairs UI is published at [stu.best](https://stu.best), with `www.stu.best` permanently redirecting to the apex and preserving paths/query strings. Runtime `d9ba36b1ecf3e8a1e3e0572f3860230779661ed8` is verified Ready as [Vercel 43s3ZCUGEcHh53fY52iBGv5DYXCX](https://vercel.com/v1-d286/std_edu_ai/43s3ZCUGEcHh53fY52iBGv5DYXCX); independent quality run `41482854168` passed. The canonical account email callbacks are also deployed to the protected provisioning Edge Function.

Verified: valid HTTPS on both names; all three project domains show Valid Configuration; original Spaceship nameservers/two CNAMEs retained; temporary verification TXT records removed. Seven live entry paths resolve the exact new `index-Dzh-ZYUf.js` build and all 49 recursive assets; all 30 public branding assets match local checksums. Browser navigation verifies home → student directory (7 categories/72 entries) → School Affairs menu/refresh, the disabled school SSO preview and separate `/signin`/`signup`. Backend verification passes owner login/profile, 103 migrations, RLS/anonymous denial, temporary CRUD cleanup, both Edge Function origins/authentication, account directory and an authenticated OpenAI QA response. New and original hosted origins work; an untrusted origin is rejected. No student emails were sent by these checks.

170 API/source checks, 24 units, lint (existing warnings), build/docs and zero dependency vulnerabilities pass. Public and School Affairs scope remains a nonofficial UI preview; real school services/authentication are not connected. Existing protected app roles and the outstanding public-email/research/manual acceptance dependencies remain unchanged. [Management and DNS details](INFRASTRUCTURE.md). Browser access is verified; permanent API administration access was not created. The local-only statuses below are historical checkpoints superseded by this release.


## School Affairs portal — Issue #80 (local review)

The signed-in student-facing School Affairs portal has been reconstructed locally at `/school-affairs`, with its blue header, collapsible sidebar, Index widgets, seven groups/25 menu views, search and a source-verified 57-row/94-link catalog. The student directory and homepage School Affairs entry now open this local portal. Custom menus, announcement bookmarks, display preferences, font controls, widget collapse and mobile/keyboard interaction work locally. All school identity, actual fee/IP/account information and opaque session URLs are excluded; visible identity/fees are demo data. Program applications beyond the copied portal remain marked external services requiring official access. No school authentication, database, provider or app-permission change is involved.

Verified 25 menu views and 23 responsive/skin/dialog states, plus 15 existing reference-page states and ten public AI/campus/study regressions. 170 API/source checks, 24 units, build/assets, lint (inherited warnings only), docs and clean dependency audit pass. Column geometry, direct URLs/back/refresh, browser-local persistence, Escape/focus, blocked storage and zero external requests/credential forms are checked. Local mobile Lighthouse: performance 96, accessibility 100, LCP 2.71s, CLS 0. [Detailed scope/evidence](../qa/PUBLIC_SITE_REBUILD.md). Local preview is running at http://127.0.0.1:5173/school-affairs. Source committed locally for review; no push/deployment. #79 and #80 remain open pending source delivery. Last published release is unchanged below.

## Public university UI — Issue #79 (local review)

The current STU homepage, complete seven-section/72-entry student directory and student-Gmail mySTU entry are rebuilt locally. The user narrowed the copied destinations to the student directory and SSO entry; other university services retain their source links. The persistent nonofficial label and disabled SSO fields/button make the requested UI-only scope explicit. No school login, SAML request replay, provider setting or database change is involved. Existing app authentication and permissions remain independent.

Verified 15 responsive/theme states, four-width navigation/refresh/back/keyboard flows, 28 local asset checksums, 170 API/source checks, 19 units, ten public AI/campus/study regression states and build/lint/docs/dependency gates. Lighthouse performance is 91 home / 100 directory / 100 SSO, accessibility 100 across all three. Source capture limits, exact commands and evidence: [Public-site reconstruction QA](../qa/PUBLIC_SITE_REBUILD.md). Local preview runs at http://127.0.0.1:5173. Source committed for local review; not pushed or deployed. Issue #79 stays open pending source delivery. Production remains the last published release below.

## In-app video help and Assistant — Issue #78

Published runtime `cf5b50a1735bdc8f2a41afcab6b06890dd82cdaf` is Ready as [Vercel Un9aZmMEwtHAsth1ub9VXbgKJYzU](https://vercel.com/v1-d286/std_edu_ai/Un9aZmMEwtHAsth1ub9VXbgKJYzU); [quality workflow 41412423044](https://github.com/LuxArt0317/std_edu_ai/actions/runs/41412423044) succeeded. `/app/help` serves seven finished guides from private client storage, recommends chapters for the actual role, and includes captions, transcripts and downloads. Each of 21 published objects matches its source SHA-256; raw/editable captures and the ElevenLabs credential stay outside the app. Active profiles can mint hour-long links; anonymous/suspended profiles and client writes are denied.

Assistant messages now use readable semantic colors, safe Markdown, responsive mode controls and a hidden upload field that cannot cause horizontal overflow. A real first-message persistence race and stale-history loads are corrected. Six light/dark/viewport states pass automated accessibility, wrapping, Escape/focus and page-error checks; text contrast is 5.60/9.32. All 45 E2E scenarios pass, plus 170 API/source tests, 15 units, build/assets, docs/dependency gates, ten public accessibility states and client backend/OpenAI verification. Eleven live research suites pass across serialized runs; bounded 200-request load probe has zero failures (shell p95 310 ms, campus 1582 ms). PDF provenance now records the installed parser version; the deployed acquisition rerun passes with `pdfjs-6.4.299@1`. All six production Help/Assistant theme/viewport states pass. Seven live entry paths resolve 30 assets, and post-release client API/RLS/CRUD/storage/Edge/OpenAI checks pass. Final independent SQL confirms one owner/account, zero QA/orphan identities or source fixtures; all 21 guide objects remain intact.

Database: 103 migrations / 101 RLS-enabled public tables. Two new migrations add private guide storage and narrow its link policy to active profiles, and extend protected fixture cleanup only to the exact client QA URL. Disposable fixtures are removed after each suite. [Current issue acceptance](../qa/ISSUE_COMPLETION.md) records unresolved gates: institutional owners/approved corpus, independent gold labels/consented human results, official physical/screen-reader route acceptance, operational signoff, scheduled source-refresh worker, and a production student-mail service. The user deferred unavailable human evidence and mail credentials. These issues remain open; no empirical result is inferred.

## Narrated video guides — Issue #77

Six chapters and a combined 12m43s walkthrough are delivered locally under ignored `artifacts/tutorials/exports/`, with English ElevenLabs narration, live role demonstrations, graphics, SRT/VTT captions and a viewing gallery. Teacher and student chapters are prioritized; all fourteen roles are represented. The complete delivery ZIP includes an editable source/assets archive. Source is versioned in [media/tutorials](../../media/tutorials/README.md); [production/QA evidence](../qa/VIDEO_GUIDES.md) records actual checks and the remaining uninterrupted human playback acceptance limit.

All seven files fully decode and load in the browser. Forty narration clips match the final master (maximum offset 0.31 ms), 251 cues pass, zero black frames are detected, and desktop/mobile gallery checks report no serious/critical accessibility findings, overflow or page errors. Private credential stays in ignored 0600 `.env.elevenlabs.local`, outside web/Vercel configuration. Temporary accounts/data/session state are removed; independent SQL confirms one protected owner, no QA/orphan identities and unchanged 101 migrations/101 RLS tables. No app runtime, schema, provider policy or deployment change.

## Published sidebar enhancement — Issue #76

Added a desktop header toggle for full navigation or a 64px icon rail. Collapsed links retain accessible names/tooltips and the account menu; the existing seven-day cookie restores the preference. Mobile retains its full-label drawer and direct Escape/focus restoration. Pointer, keyboard, account access, navigation/reload persistence and mobile-to-desktop resizing passed twelve light/dark viewport states with zero serious/critical accessibility findings, overflow or app errors. 170 API/source checks, 13 units, build/assets/lint/docs pass. Published runtime `10fa59c62a41b357395e8ff9843001a5b2f97c2a` is Ready as [Vercel AuwicGEzgDcBVXdLH2ccTsenC1DT](https://vercel.com/v1-d286/std_edu_ai/AuwicGEzgDcBVXdLH2ccTsenC1DT). Independent quality workflow `41367511024` succeeded. Twelve production states passed across the full desktop and focused mobile runs, including navigation/reload persistence and mobile-to-desktop resize. Seven production entry paths/26 recursive assets and full live client backend verification pass. A transient initial backend timeout passed on retry. Issue #76 is closed; no schema, account-policy or provider configuration changes.

## Alerts and nested UI follow-up — Issue #75

Plan opens a usable shadcn sheet with editable requests, independent student context, Escape/close/focus restoration and cancellation of obsolete responses. Nested student assistants dismiss one layer at a time. Remaining preview/research/workload headers and upload/badge text use readable semantic colors. Alert and populated task rows fit desktop/mobile; quiz options, notifications and grade-upload keyboard access are corrected. The service table stays within the viewport and scrolls with keyboard input.

Local verification: all 43 browser scenarios across full/focused runs (41/42 then 7/7 after the task fix), 170 API/source checks, 13 units, 48 expanded nested visual/theme/viewport states and ten public accessibility states. No serious/critical accessibility failures, horizontal overflow or app errors in the expanded audit. Real authenticated CRM OpenAI plan and client backend checks pass. Fixture cleanup leaves one protected owner, no QA/orphan identities and unchanged 101 migrations/101 RLS tables. Published runtime `ae1ed52d649bc5bba88f534cc4995fedaa00a72c` is Ready as [Vercel ByNoj5jtPcQFFoTnDuMzXh8Uqrkz](https://vercel.com/v1-d286/std_edu_ai/ByNoj5jtPcQFFoTnDuMzXh8Uqrkz); quality workflow `41328366529` succeeded. All 48 production nested states pass the stronger WCAG 2.1 A/AA checks, contrast/gradient checks and overflow/app-error checks. A real editable Plan request returns OpenAI guidance in the deployed UI. Seven production entry paths/26 recursive assets, live APIs and target-guarded client backend checks pass. Final affected E2E regressions passed 9/9 after semantic-label fixes. Local authenticated Alerts Lighthouse accessibility is 100 (performance 83 cold/100 warm; CLS 0).

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
