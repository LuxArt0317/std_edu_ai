# School Affairs Google sign-in — Issue #83

## Account boundary

`/school-affairs/login` uses an independent Supabase PKCE client (`stu-school-affairs-auth`). Google handles the password; only `openid email profile` scopes are requested. No school password, CAPTCHA or mailbox access is collected. The callback is `/school-affairs/auth/callback`; Nexus must not consume its code. A stale demo flag cannot unlock the portal.

Auth restores are verified with Supabase `getUser`; local JWT contents alone cannot unlock the portal. Callback exchange is deduplicated across React StrictMode. The callback waits for verified identity before navigation, removes provider errors/codes from the address bar and accepts no arbitrary return destination. Network requests have bounded deadlines. Logout uses local session scope in both workspaces; one workspace does not revoke another workspace's refresh token.

New users retain the existing trusted student-default database trigger. Existing protected owner roles are preserved. Google verifies identity; it does not establish university enrollment. The portal queries an active student record only by the verified user's `profile_id`, with caller RLS. Missing records show an explicit empty state, not a sample student or fee. Preferences are partitioned by user ID.

Public AI stays anonymous when School Affairs is signed out. Signed-in chat explicitly uses only the School Affairs JWT, read-only QA mode and the existing server-loaded/RLS-authorized context. It never borrows Nexus storage. Conversations are reset and pending requests cancelled when the School Affairs identity changes. University services in the reference catalog still require their own authorized official access.

The sign-in button uses the unmodified [Google G branding asset](https://developers.google.com/identity/branding-guidelines) on a light button.

## Provider setup

Use the client Google account and dedicated project `stu-best-school-affairs`. Configure an External Google Auth application named `stu.best School Affairs`, with only basic identity scopes. Its Web OAuth client must allow the exact callback:

`https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/callback`

The Google secret belongs only in the client Supabase Google provider configuration, never Vite, Git, screenshots or the shared infrastructure registry. Keep nonce checks enabled and email required. Add exact Supabase redirect allowlist entries for `/school-affairs/auth/callback` on the approved production and development origins; preserve existing Nexus redirects. Publish Google's audience to Production for ordinary Google accounts, rather than claiming test-user-only access works for everyone. No Gmail API, SMTP change, billing activation or broad Google data scope is needed.

The provider approval/configuration and actual live OAuth acceptance remain pending. Google Cloud first-use terms were approved and accepted; the dedicated project is created. A separate Google API Services User Data Policy and persistent OAuth-client approval was requested. No OAuth client/secret has been created and the Supabase Google provider remains disabled at this checkpoint.

## Verification

- `npm run test:school-affairs-entry`: synthetic provider/browser regression for four widths, PKCE/one-use callback, invalid/cancelled sessions, old-demo rejection, own-record filtering, read-only School Affairs chat, conversation clearing, local logout and Nexus preservation. Synthetic provider fixtures do not prove real Google sign-in.
- `npm run test:school-affairs`: 25 menu views, search, customization, account-specific preferences, announcement dialogs, keyboard/focus, mobile navigation, skins and blocked preference storage. The fixture bypasses no real provider authentication.
- `npm test`, `npm run test:unit`, `npm run lint`, `npm run build`, `npm run verify:handoff`, `npm run verify:dependency-audit` and `npm run verify:client` cover contracts, build assets, protected backend and regression checks.

Local evidence is ignored under `artifacts/google-signin/` and `artifacts/stu-reference/affairs-qa/`. Live Google acceptance and release identifiers must be recorded only after real provider configuration and production verification.

## Release asset isolation

An unpublished archive draft remains preserved separately on `codex/full-school-archive` at `9f15a95`. The current release build whitelists only its versioned mirror manifests. Unreleased raw PDF/video captures in the local public directories cannot leak into this auth build. Immutable pinned assets use hardlinks to avoid duplicating gigabytes; the importer writes atomically so later refreshes cannot change an existing build through a shared inode. Cross-filesystem builds fall back to ordinary copies.

## Local checkpoint results — November 3

194 API/source checks, 30 unit tests, TypeScript, build/lazy assets, handoff links, lint (inherited warnings) and zero-vulnerability dependency audit pass. The four-width synthetic sign-in suite passes PKCE, single callback exchange, cancellation, invalid JWT rejection, own-record empty/linked states, read-only School Affairs chat, transcript clearing, local logout and Nexus preservation. The portal suite passes all 25 menu views / 94 links / 23 automated accessibility-layout states, with zero app errors, serious/critical findings or external requests. Its obsolete source-iframe selector and opaque-frame fixture initialization were corrected; the focused source-frame regression passes. Live client verification passes protected owner/profile, 106 migrations/RLS, anonymous denial, reversible CRUD cleanup, Edge authentication/CORS, account directory and OpenAI QA. Live Google is still unverified; these fixtures are not counted as real provider acceptance.
