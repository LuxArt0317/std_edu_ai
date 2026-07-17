# Tests

The test suite lives outside Vercel's reserved `/api` directory so test modules are never deployed as serverless functions. `api/` contains contract coverage for validation, authentication, privacy filtering, provider calls, structured chatbot output, and human-reviewed grade scanning.

`api/boot-recovery.test.ts` protects the non-empty pre-JavaScript boot shell, distinct statically analyzable lazy-route boundaries, lazy-route error handling, finite startup timeouts, and local-session recovery contract that prevents a blank deployment screen.

`integration/crm-live.mjs` verifies anonymous isolation, authenticated staff access, table availability, and a reversible RLS-protected mutation against the configured production Supabase project. It requires credentials through environment variables and never stores them in the repository.

`integration/school-live.mjs` verifies the protected owner claim, anonymous isolation, academic table availability, protected answer-key access, transactional quiz scoring with cleanup, owner-demotion prevention, score ceilings, and atomic grade-scan approval.

`integration/role-portals-live.mjs` signs in with real faculty and student JWT roles, verifies teacher access, student course/topic/assessment/grade scope, answer-key isolation, grade mutation denial, and a complete student quiz cycle with owner cleanup.

`integration/all-role-accounts-live.mjs` retrieves the 14 acceptance credentials from the local macOS keychain, authenticates each identity against production, and verifies that its trusted Auth claim and self-visible profile authorization agree. It never displays or persists a password.

`integration/onboarding-live.mjs` authenticates all 14 role accounts, writes a temporary role-matched readiness record and append-only action evidence for each, verifies self/owner visibility, rejects a forged-role write and user deletion, and prints the temporary journey key for immediate operator cleanup.

`integration/build-assets.mjs` runs after every production build and fails the build unless the generated entry graph exposes the CRM JavaScript chunk and a linked stylesheet containing the semantic authentication selectors `.nexus-auth-shell` and `.nexus-auth-card`.

`integration/deployment-shell-live.mjs` verifies that deployed `/` and `/crm` contain useful pre-JavaScript recovery content instead of an empty root, recursively checks compiled entry/style/lazy-route assets, confirms that the released CRM chunk contains the role-readiness onboarding contract, and requires the live hashed asset graph to expose the CRM authentication stylesheet.

`integration/ai-live.mjs` invokes the real authenticated school chatbot and OpenAI vision grade extraction using the synthetic `fixtures/grade-sheet.svg` fixture converted to PNG. It verifies structured responses and the mandatory human-review flag without saving grades.
