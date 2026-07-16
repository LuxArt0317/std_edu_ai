# Server utilities

This folder contains server-only helpers shared by Vercel API functions. `apiAuth.ts` validates bearer sessions against Supabase Auth and derives trusted roles from `app_metadata`; browser-supplied role claims are never trusted.
