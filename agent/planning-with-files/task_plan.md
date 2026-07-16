# Task Plan

## Phase 1: Deployment recovery [Issue: GitHub issue pending plugin installation]

- reproduce the Vercel-facing failure locally
- inspect runtime-sensitive integrations and deployment configuration
- harden the production path so missing environment data does not crash the app
- verify the production build and preview output

## Current execution

- local production build reproduced as successful
- Supabase browser client identified as an unguarded runtime dependency
- deployment-safe fallback implemented for missing `VITE_SUPABASE_*` variables and unavailable `todos` data
- verification in progress
