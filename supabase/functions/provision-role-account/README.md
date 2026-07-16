# Provision role account

This Edge Function is the trusted account-creation boundary for STU Nexus. It accepts only authenticated requests from the protected platform owner, validates the requested non-owner role and identity fields, and uses the server-only Supabase service role to create or update a confirmed Auth user.

Passwords are accepted only in the HTTPS request body, are never logged or returned, and are not stored in application tables. The caller is responsible for placing the generated credential in an approved password manager or operating-system keychain.

The function deliberately excludes the `owner` role. Owner transfer or creation is not supported; the database continues to protect the single existing owner.
