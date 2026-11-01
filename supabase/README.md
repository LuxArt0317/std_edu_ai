# Supabase backend

The client database is `xiftudmvxphxcjtmfmib`, managed through the client Vercel Marketplace integration. The protected owner is `luxart0317@gmail.com`. Credentials live outside Git.

- `migrations/`: 96 ordered schema/policy/data migrations, recorded atomically in Supabase migration history.
- `functions/`: server-only account provisioning and student account workflows, authenticated in each handler.
- `certs/`: public Supabase database CA certificate for verified TLS.
- `config.toml`: local Supabase configuration. Separate seeding is disabled because no seed.sql is supplied.

Run `npm run db:plan` before `npm run db:deploy`; the runner refuses another project, an untracked pre-existing schema, and concurrent runs. It never resets a database. Client bootstrap creates only the confirmed owner; historical acceptance-account linkage is skipped when the old identities are absent.

RLS, protected owner guarantees, role governance, assessment boundaries, private buckets, and audit trails remain enforced. [Operational setup](../docs/operations/SETUP.md) and [verified handoff](../docs/operations/HANDOFF.md) are the current source of deployment facts.
