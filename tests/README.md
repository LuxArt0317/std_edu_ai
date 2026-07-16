# Tests

The test suite lives outside Vercel's reserved `/api` directory so test modules are never deployed as serverless functions. `api/` contains contract coverage for validation, authentication, privacy filtering, provider calls, structured chatbot output, and human-reviewed grade scanning.

`integration/crm-live.mjs` verifies anonymous isolation, authenticated staff access, table availability, and a reversible RLS-protected mutation against the configured production Supabase project. It requires credentials through environment variables and never stores them in the repository.

`integration/school-live.mjs` verifies the protected owner claim, anonymous isolation, academic table availability, protected answer-key access, transactional quiz scoring with cleanup, owner-demotion prevention, score ceilings, and atomic grade-scan approval.

`integration/role-portals-live.mjs` signs in with real faculty and student JWT roles, verifies teacher access, student course/topic/assessment/grade scope, answer-key isolation, grade mutation denial, and a complete student quiz cycle with owner cleanup.

`integration/ai-live.mjs` invokes the real authenticated school chatbot and OpenAI vision grade extraction using the synthetic `fixtures/grade-sheet.svg` fixture converted to PNG. It verifies structured responses and the mandatory human-review flag without saving grades.
