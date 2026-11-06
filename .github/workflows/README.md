# Quality workflow

`quality.yml` runs lint, API/source and unit checks, the production build, handoff and dependency gates, public accessibility, and copied school-route browser checks. The copied-page check serves the built site locally and requires no client credentials.

The full Playwright E2E suite creates isolated records in the client Supabase project, so run it from the protected local setup described in [tests/e2e](../../tests/e2e/README.md).
