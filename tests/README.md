# Tests

The test suite lives outside Vercel's reserved `/api` directory so test modules are never deployed as serverless functions. `api/` contains contract coverage for validation, authentication, privacy filtering, provider calls, structured chatbot output, and human-reviewed grade scanning.

`api/boot-recovery.test.ts` protects the non-empty pre-JavaScript boot shell, lazy-route error boundary, finite startup timeouts, and local-session recovery contract that prevents a blank deployment screen.

`integration/crm-live.mjs` verifies anonymous isolation, authenticated staff access, table availability, and a reversible RLS-protected mutation against the configured production Supabase project. It requires credentials through environment variables and never stores them in the repository.

`integration/school-live.mjs` verifies the protected owner claim, anonymous isolation, academic table availability, protected answer-key access, transactional quiz scoring with cleanup, owner-demotion prevention, score ceilings, and atomic grade-scan approval.

`integration/role-portals-live.mjs` signs in with real faculty and student JWT roles, verifies teacher access, student course/topic/assessment/grade scope, answer-key isolation, grade mutation denial, and a complete student quiz cycle with owner cleanup.

`integration/all-role-accounts-live.mjs` retrieves the 14 acceptance credentials from the local macOS keychain, authenticates each identity against production, and verifies that its trusted Auth claim and self-visible profile authorization agree. It never displays or persists a password.

`integration/deployment-shell-live.mjs` verifies that deployed `/` and `/crm` contain useful pre-JavaScript recovery content instead of an empty root, then checks the compiled entry, stylesheet, and lazy-route assets.

`integration/ai-live.mjs` invokes the real authenticated school chatbot and OpenAI vision grade extraction using the synthetic `fixtures/grade-sheet.svg` fixture converted to PNG. It verifies structured responses and the mandatory human-review flag without saving grades.
