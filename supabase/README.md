# Supabase

`migrations/` contains additive client database changes. `functions/` contains Edge Function sources and `certs/` contains the public TLS certificate used by deployment checks. Deploy only to the project in `deployment.json` using the root `db:plan` and `db:deploy` scripts; see [operational setup](../docs/operations/SETUP.md).

Migrations20261112080000 and20261112090000 add nullable fee metadata and owner-isolated local credit-load history. They preserve existing sample provenance, deny direct client writes, and use audited manager RPCs; history writes also require expected versions and stable request IDs. No source institution data is seeded.
