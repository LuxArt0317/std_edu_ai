# Task Plan

## Phase 1: Deployment recovery [Issue #1]

- reproduce the Vercel-facing failure locally
- inspect runtime-sensitive integrations and deployment configuration
- harden the production path so missing environment data does not crash the app
- verify the production build and preview output
- configure a deterministic Vercel runtime, install, build, output, and SPA routing contract

## Current execution

- local production build reproduced as successful
- Supabase browser client identified as an unguarded runtime dependency
- deployment-safe fallback implemented for missing `VITE_SUPABASE_*` variables and unavailable `todos` data
- explicit Vercel configuration and Node.js 22 runtime pin implemented
- clean-install, lint, production-build, and preview verification completed successfully
- root and deep-link HTTP smoke tests both returned 200 with the built application shell
