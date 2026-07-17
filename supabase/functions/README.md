# Supabase Edge Functions

This folder contains trusted server-side boundaries that require Supabase-managed secrets and must never run in the browser.

- `provision-role-account/` creates or rotates confirmed non-owner Auth identities after fresh protected-owner authorization.
- `manage-student-account/` lets the owner, administrator, or registrar create a confirmed student identity and its linked SIS record without exposing the Auth Admin API to the browser.

Every deployed function must validate authentication and authorization inside its handler, keep secrets in Supabase-managed environment variables, avoid logging credentials or personal data, and be verified against the production denial path after deployment.
