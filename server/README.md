# Server utilities

This folder contains server-only helpers shared by Vercel API functions. `apiAuth.js` is a directly traceable Node ESM runtime module; `apiAuth.d.ts` supplies its strict TypeScript contract. It validates bearer sessions against Supabase Auth and derives trusted roles from `app_metadata`; browser-supplied role claims are never trusted.
