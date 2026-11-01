# Backend reference

## STU Nexus API

- `crm-assistant.ts` is the student-success copilot boundary for the CRM.
- `school-assistant.ts` provides authenticated, persistent-chat responses and structured goal decisions adapted to the trusted school role. Ask mode is forcibly non-mutating; Agentic mode may choose at most one authorized next step. Current-message images, PDFs, and bounded text attachments are sent as native multimodal input. Writes are revalidated, explicitly confirmed one at a time, executed through the ordinary repository under the user's Supabase session, and recorded with privacy-minimized outcome metadata.
- `grade-scan.ts` accepts authenticated teacher/leadership image scans and returns structured grade candidates that require human review.
- `knowledge-ingest.ts` accepts bounded owner/admin/librarian URL, PDF, HTML, Markdown, text-file, and reviewed-content imports. URL acquisition validates DNS again at connection time, rejects private/reserved targets, revalidates redirects, requires the governed source host, and caps response time/bytes. MIME/signature checks, a server-safe DOM matrix fallback, and pinned structure-aware parsers preserve heading/page locators plus source publication/update dates before deterministic embeddings; every version stops at human review and identical input is deduplicated.
- `research-assistant.ts` is the rate-limited public, non-mutating bilingual boundary. It embeds a bounded question, calls the approved/effective/unexpired public hybrid-search RPC, rejects weak evidence, produces strict claim-to-chunk citations, fails closed on fabricated citation IDs, deterministically hands off conflicting authoritative sources, and synchronously records every successful response through an atomic content-minimized RPC.
- `research-feedback.ts` redeems an opaque, expiring, session-bound, one-use answer capability. It accepts bounded helpfulness, resolution, correction category, and optional comment data without receiving the original question or provider payload.
- `campus-route.ts` lists only verified public campus entities and produces deterministic shortest routes from exact bilingual place/alias identities. It excludes inactive, closed, unverified, out-of-hours, and ineligible graph records before routing; accessible mode rejects stairs and unsuitable connectors. It explicitly reports ambiguous, unmapped, unreachable, and pending-physical-validation states.
- `research-session.ts` is the pseudonymous participant boundary for `/study/:code`. It accepts only frozen recruiting protocols, keeps the raw participation token in a Secure/HttpOnly/SameSite cookie, strips it from responses, blocks duplicate browser enrollment, and delegates consent, task evidence, questionnaires, pause/resume, completion, withdrawal, and deletion to database-enforced RPCs. No service-role credential is required by the participant browser.

The endpoints validate and rate-limit requests, accept only bounded context, enforce structured model output, and never return provider credentials. Authentication roles are derived from Supabase `app_metadata`, never from a browser-supplied role.

Student actions are limited to authorized navigation and self-owned learning-progress updates. Nexus never receives an executable student tool for answering, completing, modifying, grading, or submitting assignments, quizzes, exams, or projects.

Agent runs are capped at eight steps and five minutes. The portal detects three identical consecutive actions, supports cancellation, automatically performs safe navigation, and resumes a mutation goal only after the user confirms and the repository reports success. `working` responses without a permitted action fail closed as `impossible`.

For authorized academic leaders, `create_curriculum` is deliberately one bulk action rather than dozens of fragile dependent steps. Its strict structured payload includes the whole program, subjects, prerequisites, and block templates; the client shows the complete plan before confirmation and the database commits it atomically.

`tsconfig.json` supplies the strict Node.js compiler context used when Vercel builds each function independently. The runtime authentication helper and its TypeScript declaration live in `server/` so they are bundled as dependencies rather than exposed as another endpoint.

Required runtime environment variables: `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Optional variables are `OPENAI_MODEL`, `OPENAI_PUBLIC_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_EMBEDDING_MODEL`, and `SAFETY_HASH_SALT`. Public evidence persistence uses a narrowly validated database capability and does not require a browser or server service-role key.

Client Vercel Marketplace configuration may supply `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; all relevant server endpoints accept these aliases without exposing service keys. See [client setup](../operations/SETUP.md).

## Server utilities

This folder contains server-only Node ESM helpers shared by Vercel API functions. Runtime helpers use `.js` files so Vercel packages them with each function; matching `.d.ts` files provide strict TypeScript contracts.

- `apiAuth.js` validates bearer sessions against Supabase Auth and derives trusted roles from `app_metadata`; browser-supplied role claims are never trusted.
- `knowledgePipeline.js` normalizes, fingerprints, chunks, canonicalizes, and classifies governed corpus content deterministically.
- `ragEvaluation.js` provides the dependency-free reference implementation for retrieval, citation, aggregate, latency, cost, and release-gate reconciliation used by Issue #124 contracts.

Client authentication accepts the Marketplace publishable URL/key aliases in addition to Vite/Supabase names. Authorization still verifies the actual Auth user and trusted app metadata.

## Database TLS trust

`prod-ca-2021.crt` is Supabase's public database root certificate, obtained from the client dashboard's Download certificate link at https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. Migration and live-verification commands trust this CA while requiring certificate and hostname verification. This file is public trust material, not a credential.

## Manage student account

This Edge Function creates or updates a confirmed student Auth identity and its linked profile/SIS student record through one protected operator workflow.

- Only a fresh authenticated `owner`, `admin`, or `registrar` session is accepted.
- The account is always assigned the canonical `student` role; owner creation is impossible.
- Email, student number, names, authoritative academic program ID, year level, optional phone, and optional advisor are validated. The program's canonical code is synchronized into the legacy display label.
- A student number already linked to another identity and an email belonging to a non-student account are rejected.
- Temporary passwords are accepted only in the HTTPS request body and are never logged, returned, or stored in application tables.
- If a newly created Auth identity cannot be linked to the academic record, the function deletes that new identity as compensation.

Client deployment: xiftudmvxphxcjtmfmib, origin https://stdeduai.vercel.app. Authorization continues to require the owner, administrator, or registrar.

## Provision role account

This Edge Function is the trusted account-creation boundary for STU Nexus. It accepts only authenticated requests from the protected platform owner, validates the requested non-owner role and identity fields, and uses the server-only Supabase service role to create or update a confirmed Auth user.

Passwords are accepted only in the HTTPS request body, are never logged or returned, and are not stored in application tables. The caller is responsible for placing the generated credential in an approved password manager or operating-system keychain.

The function deliberately excludes the `owner` role. Owner transfer or creation is not supported; the database continues to protect the single existing owner.

Client deployment: xiftudmvxphxcjtmfmib, origin https://stdeduai.vercel.app. The owner identity is determined by trusted metadata and the protected profile, not an inherited email string.

## Supabase Edge Functions

This folder contains trusted server-side boundaries that require Supabase-managed secrets and must never run in the browser.

- `provision-role-account/` creates, invites, resends invitations for, or rotates confirmed non-owner Auth identities; returns the protected-owner-only Auth activity directory; revokes sessions; and performs reason-confirmed activation, suspension, archival, and restoration after fresh protected-owner authorization. Access and lifecycle changes preserve the protected owner and append immutable governance evidence.
- `manage-student-account/` lets the owner, administrator, or registrar create a confirmed student identity and its linked SIS record without exposing the Auth Admin API to the browser.

Every deployed function must validate authentication and authorization inside its handler, keep secrets in Supabase-managed environment variables, avoid logging credentials or personal data, and be verified against the production denial path after deployment.

Client CORS allows https://stdeduai.vercel.app plus explicit local development origins. Both functions are deployed into xiftudmvxphxcjtmfmib using the client Supabase dashboard; never deploy them through an unrelated globally signed-in account.

## Database migrations

These ordered SQL files are the reviewed production history for STU Nexus. Create new files with `npx supabase migration new <name>` and never rewrite a migration after it has been applied remotely. Every exposed table must include RLS, least-privilege Data API grants, and indexes covering foreign keys and expected policy filters.

The onboarding migrations add per-user/per-role/per-version readiness and append-only action evidence, then cover the composite event ownership foreign key used for integrity and cascade cleanup.

`20260717133008_academic_operations_workflows.sql` adds a transactional, role-gated enrollment command with identity synchronization and capacity enforcement, plus room, faculty, and shared-student schedule collision checks.

The integrated LMS migration set adds modules, materials, submissions, attendance, progress, private Storage authorization, integrity triggers, advisor-driven policy/index optimization, and an atomic objective assessment builder with protected answer keys.

`20260718234504_immersive_lms_integrity_controls.sql` adds teacher-controlled post-attempt review and disclosed fullscreen/focus/display/camera/clipboard policy, append-only student/teacher-scoped integrity evidence, safe reviewed-answer disclosure, and inline lesson video MIME/size support. `20260718235722_assessment_integrity_student_index.sql` covers the student evidence foreign key and read path.

`20260717231612_account_lifecycle_controls.sql` adds the account status projection and an immutable, owner-readable lifecycle audit for Auth-enforced activation, suspension, archival, and restoration.

`20260717232914_account_directory_and_session_revocation.sql` adds immutable access-operation history and the service-role-only session revocation command. `20260717233309_student_support_self_service.sql` lets a student open a case only against their own linked SIS record while leaving assignment and resolution with authorized staff.

`20260717233540_optimize_account_and_support_policies.sql` covers every new audit foreign key and consolidates staff/student case creation into one role-aware insert policy.

`20260717234309_complete_needed_controlled_workflows.sql` adds relational department/program/class responsibilities, student attendance-correction requests, and reasoned final-grade publication, published-grade correction, term closing, and attendance decisions with immutable before/after evidence. The two following migrations make pending correction uniqueness lifecycle-safe and cover all new policy foreign keys without duplicate permissive reads.

`20260718000718_notifications_and_approved_communication.sql` replaces self-insertable notifications with recipient read/update and authorized delivery policies, adds participant-scoped communication requests, and exposes a support/admin approval RPC that atomically delivers portal notifications and writes controlled-action evidence.

`20260718001256_controlled_student_program_submission_records.sql` adds durable student record states and merge lineage, audited withdrawal/merge/program archival/enrollment transitions, and audited submission return/void operations. Each command validates fresh authorization and transition preconditions before preserving before/after state.

The `20260718002408`–`20260718005944` completion set closes the remaining `needed.md` governance boundaries: mandatory first-login password replacement, identity synchronization, admissions handoff and notifications, all-role RLS alignment, scoped department staff editing, institutional initiatives, Registrar exports, assessment availability/release controls, governed question and attempt readers, sensitive-case evidence, bulk campaign approval/delivery, and archive-only CRM retention. Direct answer explanations and unreleased score columns are not selectable by learners; trusted readers apply the teacher's release settings.

`20260718052529_connect_students_to_academic_programs.sql` replaces the ambiguous student program label as the authoritative relationship with a protected foreign key to `academic_programs`, safely backfills existing records, indexes the relationship, and retains the legacy label as a trigger-synchronized compatibility projection.

`20260718055707_manage_academic_curriculum_lifecycle.sql` adds an atomic, security-invoker curriculum editor for draft metadata, subject sequence, catalog synchronization, prerequisites, blocks, approval, and retirement. `20260718060555_authorize_curriculum_audit_evidence.sql` grants only a narrowly constrained same-transaction curriculum audit insert whose actor, role, entity, status, year, and update timestamp must match the changed plan.

`20260719003437_nexus_attachments_queue_and_manual_curricula.sql` adds private owner-folder chat attachments, an RLS-protected durable prompt queue, attachment metadata on chat history, manual program-linked curriculum creation, and audited draft deletion. `20260719005202_authorize_draft_curriculum_deletion_audit.sql` adds the narrowly constrained production follow-up policy required for immutable deletion evidence.

The Issue #104 research migrations beginning at `20260719063425` add governed RAG, campus routing, pseudonymous study execution, and evidence-safe workload measurement. The Issue #120 workload set (`20260719081744`–`20260719082932`) enforces aggregate provenance, comparable windows, independent review, explicit confirmed resolution, small-cell suppression, protected Data API access, reversible synthetic cleanup, and covering foreign-key indexes.

The Issue #121 ingestion-operations set (`20260719083702`–`20260719085219`) adds content-free per-run and per-attempt telemetry, bounded retry/dead-letter invariants, protected health summaries, stale-worker quarantine, fixture-safe cleanup, and covering requester/run indexes. Operational rows deliberately exclude source content, prompts, credentials, and raw provider payloads.

The Issue #122 review set (`20260719090630`–`20260719092100`) adds atomic reject/change-request/quarantine decisions, exact deployed-acquisition fixture cleanup, covering document-lineage/governance indexes, separate source/document/chunk mutation policies so authorized reads are evaluated once rather than through duplicate permissive SELECT policies, and an explicit owner/admin/librarian-only document mutation boundary aligned with the ingestion and review APIs.

The Issue #123 evidence set (`20260719095500`–`20260719095730`) atomically writes privacy-safe public query/answer/retrieval/citation traces, issues expiring one-use feedback capabilities from a private table, accepts session-bound bounded feedback, exposes content-free reports only to owner/admin/librarian roles, and extends the guarded owner-only fixture purge so cited synthetic chunks can be removed without weakening normal evidence foreign keys.

The Issue #124 evaluation set (`20260719101837`–`20260719103841`) adds governed dataset versions, two-person independent case approval, checksummed freezing, immutable run evidence, deterministic retrieval/citation/answer/abstention/leakage/latency/cost scoring, aggregate and segmented reports, complete relationship indexes, and an owner-only reversible fixture boundary. Ordinary freezing always requires at least 150 eligible cases and complete domain/language/failure coverage.

`20260719131000_stu_source_inventory_candidates.sql` adds the Issue #127 official-source discovery boundary: canonical official-host identities, ten research domains, protected review states, direct-transition guards, idempotent candidate import, role-gated reports, atomic acceptance into inactive governed sources, and exact owner-only fixture cleanup. Discovery and acceptance cannot create documents, chunks, embeddings, approvals, or public knowledge.

## Fresh client deployment (Issue #73)

The client runner applies this directory in timestamp order with one transaction and migration-history record per file. The curriculum foundation is named `20260718054000_agentic_curriculum_workflow.sql` so its tables precede lifecycle functions. The protected owner comes from the client bootstrap setting (default luxart0317@gmail.com). Two historical acceptance-identity synchronization migrations skip if their original identities are absent. No old role accounts are created by client setup.

## Supabase backend

The client database is `xiftudmvxphxcjtmfmib`, managed through the client Vercel Marketplace integration. The protected owner is `luxart0317@gmail.com`. Credentials live outside Git.

- `migrations/`: 96 ordered schema/policy/data migrations, recorded atomically in Supabase migration history.
- `functions/`: server-only account provisioning and student account workflows, authenticated in each handler.
- `certs/`: public Supabase database CA certificate for verified TLS.
- `config.toml`: local Supabase configuration. Separate seeding is disabled because no seed.sql is supplied.

Run `npm run db:plan` before `npm run db:deploy`; the runner refuses another project, an untracked pre-existing schema, and concurrent runs. It never resets a database. Client bootstrap creates only the confirmed owner; historical acceptance-account linkage is skipped when the old identities are absent.

RLS, protected owner guarantees, role governance, assessment boundaries, private buckets, and audit trails remain enforced. [Operational setup](../operations/SETUP.md) and [verified handoff](../operations/HANDOFF.md) are the current source of deployment facts.
