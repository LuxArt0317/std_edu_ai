# Supabase

`migrations/` contains additive client database changes. `functions/` contains Edge Function sources and `certs/` contains the public TLS certificate used by deployment checks. Deploy only to the project in `deployment.json` using the root `db:plan` and `db:deploy` scripts; see [operational setup](../docs/operations/SETUP.md).
