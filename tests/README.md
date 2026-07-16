# Tests

The test suite lives outside Vercel's reserved `/api` directory so test modules are never deployed as serverless functions. `api/` contains contract coverage for validation, privacy filtering, provider calls, and structured output.

`integration/crm-live.mjs` verifies anonymous isolation, authenticated staff access, table availability, and a reversible RLS-protected mutation against the configured production Supabase project. It requires credentials through environment variables and never stores them in the repository.
