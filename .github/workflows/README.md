# Quality workflow

`quality.yml` runs lint, API/source and unit checks, offline assistant evaluation, the production build, handoff and dependency gates, public accessibility, and copied school-route browser checks. The evaluation contracts use local fixtures. The copied-page check serves the built site locally and requires no client credentials.

The full Playwright E2E suite creates isolated records in the client Supabase project, so run it from the protected local setup described in [tests/e2e](../../tests/e2e/README.md).

`supabase-activity.yml` temporarily makes a read-only, external Data API request to the exact client Supabase project three times daily. Its one-month cutoff is encoded in `scripts/supabase-activity.mjs`; the workflow stops requesting data at that instant and disables itself on the next scheduled run. The publishable key is a repository Actions secret. See [temporary activity operations](../../docs/operations/INFRASTRUCTURE.md#temporary-supabase-activity-check--issue-97).
