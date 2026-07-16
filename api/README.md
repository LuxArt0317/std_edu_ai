# STU Nexus API

- `crm-assistant.ts` is the student-success copilot boundary for the CRM.
- `school-assistant.ts` provides authenticated, persistent-chat responses adapted to the trusted school role.
- `grade-scan.ts` accepts authenticated teacher/leadership image scans and returns structured grade candidates that require human review.

The endpoints validate and rate-limit requests, accept only bounded context, enforce structured model output, and never return provider credentials. Authentication roles are derived from Supabase `app_metadata`, never from a browser-supplied role.

Required runtime environment variables: `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Optional variables are `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, and `SAFETY_HASH_SALT`.
