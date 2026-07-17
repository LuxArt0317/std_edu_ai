# STU Nexus API

- `crm-assistant.ts` is the student-success copilot boundary for the CRM.
- `school-assistant.ts` provides authenticated, persistent-chat responses and server-filtered action proposals adapted to the trusted school role. Writes are revalidated, explicitly confirmed, executed through the ordinary repository under the user's Supabase session, and recorded with privacy-minimized outcome metadata.
- `grade-scan.ts` accepts authenticated teacher/leadership image scans and returns structured grade candidates that require human review.

The endpoints validate and rate-limit requests, accept only bounded context, enforce structured model output, and never return provider credentials. Authentication roles are derived from Supabase `app_metadata`, never from a browser-supplied role.

Student actions are limited to authorized navigation and self-owned learning-progress updates. Nexus never receives an executable student tool for answering, completing, modifying, grading, or submitting assignments, quizzes, exams, or projects.

`tsconfig.json` supplies the strict Node.js compiler context used when Vercel builds each function independently. The runtime authentication helper and its TypeScript declaration live in `server/` so they are bundled as dependencies rather than exposed as another endpoint.

Required runtime environment variables: `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Optional variables are `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, and `SAFETY_HASH_SALT`.
