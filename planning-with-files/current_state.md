# Current client state

Issue #74: taste-led transactional UI overhaul is implemented and committed locally in std_edu_ai-luxart0317. It builds on merged School OS commit 7d7690f. Original checkout/database untouched; current UI is not pushed or deployed.

UI: compact grouped sidebar, neutral Light/Dark/System themes with green accent, concise headings/labels, no promotional heroes/context banners or duplicate assistant launchers. Cases/departments use tables; Academics has Add/Export menus and separate change requests. Account menu owns appearance, preview and sign-out. Assistant has plain modes, accessible controls, keyboard scroll and focus return. Trusted permissions and approval flows are preserved.

Verified: 170 API/source tests, eight units, all 29 E2E scenarios across full/focused runs (23/27 then final 6/6), 30 light/dark main-page scans and ten public accessibility states. Build/assets/docs/dependency audit pass; vulnerabilities zero. Lint exits successfully with inherited React warnings. Sign-in Lighthouse desktop: performance 98, accessibility 100, LCP 0.7s, CLS 0, TBT 0ms. This is local lab evidence.

Final teardown removed 13 QA accounts, isolated records and private session state. Independent SQL confirms one protected owner, no test-named users and no orphaned identities; schema unchanged at 100 migrations / 101 public RLS tables. Credentials and raw traces/screenshots remain ignored/private.

Local dev site: http://localhost:5173/crm. Owner credentials remain in ignored .env.owner.local. Remaining: review/release the UI when requested, then verify the actual Vercel deployment. Manual assistive-technology, research/institutional review and email delivery remain external acceptance work.
