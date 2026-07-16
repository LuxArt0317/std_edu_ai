# STU Nexus API

`crm-assistant.ts` is the server-only OpenAI boundary for the CRM. It validates and rate-limits requests, accepts only the de-identified context produced by the CRM client, enforces structured model output, and never returns provider credentials.

Required runtime environment variable: `OPENAI_API_KEY`. Optional variables are `OPENAI_MODEL` and `SAFETY_HASH_SALT`.

