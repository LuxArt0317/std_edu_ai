# Client infrastructure

Domain and management routes verified in the provider dashboards on 2026-11-03 (Asia/Manila).

| Resource | Client value |
| --- | --- |
| Repository | [LuxArt0317/std_edu_ai](https://github.com/LuxArt0317/std_edu_ai), private |
| Vercel team | `V1`, slug `v1-d286` |
| Vercel project | [std_edu_ai](https://vercel.com/v1-d286/std_edu_ai) |
| Production | [stu.best](https://stu.best) |
| Alternate host | `www.stu.best` → 308 permanent redirect to `https://stu.best`; original `stdeduai.vercel.app` remains available |
| Registrar / DNS | Spaceship; `launch1.spaceship.net`, `launch2.spaceship.net` |
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

The Vercel SPA rewrite must exclude `/assets/`, `/site-pages/`, `/school-pages/` and `/school-assets/`. Missing static files should return HTTP 404, since rewriting them to `index.html` can show a misleading boot shell or deliver HTML to a JavaScript module request. Page HTML uses `Cache-Control: no-store`; content-hashed assets remain normally served. The entry HTML includes a bounded one-time refresh when a stale page points to a removed bundle. Verify these behaviors against the production domain after each routing change. The routing pattern follows [Vercel's documented negative-lookahead rewrite syntax](https://vercel.com/docs/project-configuration/vercel-json#rewrites).


The client Vercel Git integration automatically deployed the handoff release from main. Browser access and Marketplace database administration are verified. The server-only AI configuration is present and a live authenticated OpenAI-backed response was verified; no provider key was read or copied into the repository.

## Custom domain — Issue #81

`stu.best` is assigned to Production in the exact client Vercel project; `www.stu.best` redirects permanently to the apex. Spaceship retains DNS authority. Both apex (flattened) and www retain their existing CNAME target `fea570b56e7573bf.vercel-dns-017.com.` with a 30-minute TTL. Ownership was verified using temporary TXT challenges, then those challenges were removed after both domains showed Valid Configuration. No nameserver transfer or registrar API credential was needed. A non-secret pre-change record backup is ignored under `artifacts/domain-stu-best/`.

Supabase Auth Site URL is `https://stu.best`. Exact `/signin` and compatibility `/crm` callbacks are allowlisted for both the apex and original Vercel alias; localhost and 127.0.0.1 retain `/signin`. Both account Edge Functions allow the new apex origin while retaining existing origins and requiring the same authorization. Provisioned-account invitations and resend links now target `https://stu.best/signin`. Email delivery limitations and account permissions are unchanged.

Management uses the existing signed-in Spaceship and client Vercel dashboards, plus the verified Vercel Marketplace Supabase SSO. These are session-based access routes, not permanent agent access. No new broad API key was created. The local Supabase CLI management-list request did not complete; CLI administration is not claimed as verified. Change DNS through [Spaceship Advanced DNS](https://www.spaceship.com/application/advanced-dns-application/manage/stu.best/) and routing through [Vercel Domains](https://vercel.com/v1-d286/std_edu_ai/settings/domains). Verify the client identity before future operations.

## Production branch provisioning — Issue #84

The 2026-11-03 mirror deployment initially failed before build because the existing Supabase connection attempted a Preview Branch action for Production. In resource Projects → Update Project Connection, Production branching is now disabled; Preview branching remains enabled. The connection still covers Preview and Production, Require Active Resource stays required, and Sensitive stays enabled. Saved production/preview/required checkbox state was independently reopened and verified. The stable client database remains `xiftudmvxphxcjtmfmib`; its roles, RLS, account policies and existing environment values were not changed.
