# Changelog

## Unreleased

- scaffolded the repository with the latest Vite React TypeScript app
- replaced the starter page with an AI-enhanced Shu-Te University landing page
- added a mocked campus AI assistant service and knowledge base
- documented project understanding, setup, and planning state
- hardened the Supabase browser client so missing Vercel env vars no longer break the app at startup
- added fallback messaging for missing Supabase configuration or unavailable `todos` data
- added an explicit Vercel deployment configuration with a Node.js 22 runtime pin, lockfile-based installs, Vite output settings, and SPA rewrites
