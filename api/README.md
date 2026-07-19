# STU Nexus API

- `crm-assistant.ts` is the student-success copilot boundary for the CRM.
- `school-assistant.ts` provides authenticated, persistent-chat responses and structured goal decisions adapted to the trusted school role. Ask mode is forcibly non-mutating; Agentic mode may choose at most one authorized next step. Current-message images, PDFs, and bounded text attachments are sent as native multimodal input. Writes are revalidated, explicitly confirmed one at a time, executed through the ordinary repository under the user's Supabase session, and recorded with privacy-minimized outcome metadata.
- `grade-scan.ts` accepts authenticated teacher/leadership image scans and returns structured grade candidates that require human review.
- `knowledge-ingest.ts` accepts bounded owner/admin/librarian content imports, canonicalizes provenance, creates deterministic checksummed document versions/chunks, generates server-only OpenAI embeddings, and stops at the human review boundary. Duplicate content is idempotently returned instead of indexed twice.
- `research-assistant.ts` is the rate-limited public, non-mutating bilingual boundary. It embeds a bounded question, calls the approved/effective/unexpired public hybrid-search RPC, rejects weak evidence, produces strict claim-to-chunk citations, fails closed on fabricated citation IDs, abstains when evidence is missing, and optionally records privacy-minimized traces when a server service credential is configured.
- `campus-route.ts` lists only verified public campus entities and produces deterministic shortest routes from exact bilingual place/alias identities. It excludes inactive, closed, unverified, out-of-hours, and ineligible graph records before routing; accessible mode rejects stairs and unsuitable connectors. It explicitly reports ambiguous, unmapped, unreachable, and pending-physical-validation states.
- `research-session.ts` is the pseudonymous participant boundary for `/study/:code`. It accepts only frozen recruiting protocols, keeps the raw participation token in a Secure/HttpOnly/SameSite cookie, strips it from responses, blocks duplicate browser enrollment, and delegates consent, task evidence, questionnaires, pause/resume, completion, withdrawal, and deletion to database-enforced RPCs. No service-role credential is required by the participant browser.

The endpoints validate and rate-limit requests, accept only bounded context, enforce structured model output, and never return provider credentials. Authentication roles are derived from Supabase `app_metadata`, never from a browser-supplied role.

Student actions are limited to authorized navigation and self-owned learning-progress updates. Nexus never receives an executable student tool for answering, completing, modifying, grading, or submitting assignments, quizzes, exams, or projects.

Agent runs are capped at eight steps and five minutes. The portal detects three identical consecutive actions, supports cancellation, automatically performs safe navigation, and resumes a mutation goal only after the user confirms and the repository reports success. `working` responses without a permitted action fail closed as `impossible`.

For authorized academic leaders, `create_curriculum` is deliberately one bulk action rather than dozens of fragile dependent steps. Its strict structured payload includes the whole program, subjects, prerequisites, and block templates; the client shows the complete plan before confirmation and the database commits it atomically.

`tsconfig.json` supplies the strict Node.js compiler context used when Vercel builds each function independently. The runtime authentication helper and its TypeScript declaration live in `server/` so they are bundled as dependencies rather than exposed as another endpoint.

Required runtime environment variables: `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Optional variables are `OPENAI_MODEL`, `OPENAI_PUBLIC_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_EMBEDDING_MODEL`, `SAFETY_HASH_SALT`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` used for public answer-evidence persistence.
