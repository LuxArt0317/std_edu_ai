# Client infrastructure

Verified in the provider dashboards on 2026-11-01 (Asia/Manila).

| Resource | Client value |
| --- | --- |
| Repository | [LuxArt0317/std_edu_ai](https://github.com/LuxArt0317/std_edu_ai), private |
| Vercel team | `V1`, slug `v1-d286` |
| Vercel project | [std_edu_ai](https://vercel.com/v1-d286/std_edu_ai) |
| Production | [stdeduai.vercel.app](https://stdeduai.vercel.app) |
| Supabase | `supabase-purple-button`, project `xiftudmvxphxcjtmfmib` |
| Supabase dashboard | [Client database](https://supabase.com/dashboard/project/xiftudmvxphxcjtmfmib) |
| Protected application owner | `luxart0317@gmail.com`, confirmed by the user |
| Supabase management | Vercel Marketplace SSO: project Storage → connected Supabase resource → Open in Supabase |

[deployment.json](../../deployment.json) is the machine-readable non-secret target record. Future agents must verify these exact identifiers before provider changes.

## Access

GitHub CLI was verified as `LuxArt0317`. The client Vercel browser session and Marketplace SSO were verified. The globally installed Vercel CLI was signed in as a different account (`wnnsnn`) with a different team; do not treat it as access to this client team. No Vercel token or Supabase management token is stored in this repository.

Resource connection values live only in provider-managed environment settings and ignored owner-readable local environment files. A new agent must check its actual tools/session before claiming access. A repository document records access routes; it cannot confer provider permissions.

The original Supabase project `zhcchldvgqrkfqoknewk` and the separate dashboard project `wubnovvoklsdsxjvsyxz` are not this client's connected database. This handoff never changes them.

## Release verification

The client Vercel Git integration automatically deployed the handoff release from main. Browser access and Marketplace database administration are verified. The server-only AI configuration is present and a live authenticated OpenAI-backed response was verified; no provider key was read or copied into the repository.
