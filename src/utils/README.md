# Shared browser utilities

This folder contains small, provider-independent helpers shared by the public site and authenticated platform.

- `supabase.ts` creates the browser-safe Supabase client only when deployment configuration is available.
- `async.ts` provides finite promise timeouts so authentication and portal startup cannot remain pending forever.

Utilities in this folder must not contain server-only credentials or expose sensitive session material.
