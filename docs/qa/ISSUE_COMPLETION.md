# Current issue completion audit

Scope authorized on 2026-11-02: implement and verify feasible code/UI work, integrate video guides into the live app and repair Assistant readability. The user explicitly deferred unavailable institutional/physical/human evidence and student-email credentials. Historical original issue numbers and deployment claims are preserved as archived context; current client validation is recorded separately here.

| Client issue | Engineering work to verify | Remaining acceptance evidence |
| --- | --- | --- |
| #78 · Video help and Assistant | Private role guide storage, authenticated Help route, playback/captions/downloads; readable safe Markdown, message layout and responsive controls | 45/45 browser scenarios pass locally, including all fourteen roles; production release verification in progress |
| #75 · UI and signup | Shared theme/layout, secure public student signup and role boundaries | Production student confirmation-mail provider deferred by user |
| #63 · Authoritative corpus | Source/ingestion/review/rollback/refresh UI, metadata and full role matrix | Named institutional owners and complete approved official corpus; production scheduled source-refresh worker/acceptance remains unimplemented. Manual change ingestion and atomic review/rollback are verified. User deferred unavailable approval evidence |
| #65 · Hybrid RAG | Claim citations, eligibility, freshness/conflict/abstention, public/action separation and failure behavior | Independently reviewed >=150-case bilingual gold set and frozen pilot latency/quality metrics |
| #67 · Campus navigation | Provenance/eligibility, directional/accessibility/hours/closure routing, keyboard/text alternatives | Official complete inventory, signed physical route walks, human screen-reader acceptance |
| #69 · Study platform | Consent separation, deterministic counterbalance, objective task telemetry, SUS/SEQ scoring, withdrawal/retention/export | Approved protocol/instruments and real pilot/participant evidence |
| #71 · Hardening | WCAG automated/keyboard checks, RLS/adversarial/security/privacy, monitoring/load/recovery/rollback | Human assistive-technology review and institution-assigned operational acceptance |
| #61 · Research epic | Reconcile migrated tracker against current verified child implementation | Parent remains open while required institutional/empirical gates are unfulfilled |

The existing research completion ledger refers to the original repository and is not client release evidence. Its measurements and human approvals will not be invented or silently reassigned. Synthetic tests prove software paths, not empirical university outcomes.

## Verified client engineering evidence (2026-11-02)

Eleven live research suites passed across serialized runs: foundation, ingestion telemetry, ingestion API, reviewed URL/PDF acquisition, real server embeddings/RAG/citation/feedback, campus routing, study runner, evaluation, role-matrix RLS, operations/recovery and adversarial ingestion. The first acquisition run exposed a cleanup whitelist tied to the original domain; migration `20261102163000_client_fixture_and_guide_guards.sql` adds only the exact client verification URL, preserving owner/name/URL restrictions. The affected suite and remaining suites pass after deployment. Every coordinator run removed its thirteen temporary accounts and session ledger.

The client load probe completed 200 requests at concurrency 10 without failures (shell p95 310 ms, campus API p95 1582 ms). These are bounded probes, not long-running availability measurements. Public automated accessibility passed ten states; video-help/Assistant passed both themes at 1440, 1024 and 390 px with no severe Axe findings, overflow or page errors. User-text contrast is 5.60:1 light and 9.32:1 dark.

`knowledge_sources.crawl_policy` and its interval are existing metadata. No background refresh worker is installed by this handoff. Operators can acquire source changes through the reviewed ingestion UI; interval metadata alone must not be described as automatic scheduled acquisition. This remains tracked in #63 rather than silently claimed complete.

Source fixtures, generated evaluation vectors and synthetic participant paths verify software mechanics. They are not approved corpus contents, independent gold judgments, consenting human participants or a measured workload benefit. The seven original open issues therefore remain open unless their remaining acceptance gates are met. #78 is separately eligible for closure after live release verification.

Release gates currently pass: lint (inherited React warnings), 170 API/source checks, 15 units, production build/assets, documentation links, zero dependency vulnerabilities, full client database/RLS/CRUD/storage/Edge Function and real OpenAI QA verification. Full browser run: 45/45, including real first-message history reload and private student playback/captions. Final affected regressions and post-release evidence are recorded in the handoff.
