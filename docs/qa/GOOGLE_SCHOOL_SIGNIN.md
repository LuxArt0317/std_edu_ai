# School Affairs Google sign-in — Issue #83

## Account boundary

`/school-affairs/login` uses an independent Supabase PKCE client (`stu-school-affairs-auth`). Google handles the password; only `openid email profile` scopes are requested. No school password, CAPTCHA or mailbox access is collected. The callback is `/school-affairs/auth/callback`; Nexus must not consume its code. A stale demo flag cannot unlock the portal.

Auth restores are verified with Supabase `getUser`; local JWT contents alone cannot unlock the portal. Callback exchange is deduplicated across React StrictMode. The callback waits for verified identity before navigation, removes provider errors/codes from the address bar and accepts no arbitrary return destination. Network requests have bounded deadlines. Logout uses local session scope in both workspaces; one workspace does not revoke another workspace's refresh token.

New users retain the existing trusted student-default database trigger. Existing protected owner roles are preserved. Google verifies identity; it does not establish university enrollment. The portal queries an active student record only by the verified user's `profile_id`, with caller RLS. Missing records show an explicit empty state, not a sample student or fee. Preferences are partitioned by user ID.

Public AI stays anonymous when School Affairs is signed out. Signed-in chat verifies only the School Affairs JWT and uses the separate School Affairs endpoint; it does not load the Nexus operating context, courses, terms or students. Public questions discard account identity and prior private turns before retrieval. Conversations are reset and pending requests cancelled when the School Affairs identity changes. University services in the reference catalog still require their own authorized official access. [Assistant behavior and verification](SCHOOL_AFFAIRS_ASSISTANT.md).

The sign-in button uses the unmodified [Google G branding asset](https://developers.google.com/identity/branding-guidelines) on a light button.

## Provider setup

The client Google project `stu-best-school-affairs` now has an External Google Auth application named `stu.best School Affairs` and a Web OAuth client with only `openid`, email and profile scopes. The authorized JavaScript origin is `https://stu.best`; the exact Google callback is:

`https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/callback`

The Google secret is saved only in the client Supabase Google provider configuration, never Vite, Git, screenshots or the shared infrastructure registry. Google provider is enabled with nonce checks and email requirement preserved. Supabase has exact `/school-affairs/auth/callback` allowlist entries for `stu.best`, `stdeduai.vercel.app`, `localhost:5173`, `127.0.0.1:5173` and `127.0.0.1:5175`; the six existing Nexus entries remain. Google's External audience is **In production**, allowing ordinary Google accounts. No Gmail API, SMTP change, billing activation or broad Google data scope was added.

The user approved Google Cloud terms, the Google API Services User Data Policy and basic Google sign-in setup. Those agreements were accepted, the OAuth client was created, and Supabase provider/callback settings were saved and verified. The local real sign-in reached Google's account chooser with the exact client/callback. Google then required account-holder passkey/phone/Authenticator verification, so completed real-user callback and linked-record acceptance remain **unverified** until the account holder finishes that step. No test-only flow is counted as real OAuth acceptance.

The Google entry code is now published on `stu.best` in source `26166bb` ([Vercel release](https://vercel.com/v1-d286/std_edu_ai/CNYWCeXWMycuUeXpGfchmE2mcTCU), Ready; [quality run](https://github.com/LuxArt0317/std_edu_ai/actions/runs/41567024916), successful). The public `/school-affairs/login` route returns HTTP 200. This proves deployment and provider setup, **not** completed account-holder OAuth sign-in. Issue #83 remains open for a real callback, identity/linked-record and logout/isolation check after Google verification.

## Verification

- `npm run test:school-affairs-entry`: synthetic provider/browser regression for four widths, PKCE/one-use callback, invalid/cancelled sessions, old-demo rejection, own-record filtering, read-only School Affairs chat, conversation clearing, local logout and Nexus preservation. Synthetic provider fixtures do not prove real Google sign-in.
- `npm run test:school-affairs`: 25 menu views, search, customization, account-specific preferences, announcement dialogs, keyboard/focus, mobile navigation, skins and blocked preference storage. The fixture bypasses no real provider authentication.
- `npm test`, `npm run test:unit`, `npm run lint`, `npm run build`, `npm run verify:handoff`, `npm run verify:dependency-audit` and `npm run verify:client` cover contracts, build assets, protected backend and regression checks.

Local evidence is ignored under `artifacts/google-signin/` and `artifacts/stu-reference/affairs-qa/`. Record live callback and release identifiers only after direct verification.

## Release asset isolation

An unpublished archive draft remains preserved separately on `codex/full-school-archive` at `9f15a95`. The current release build whitelists only its versioned mirror manifests. Unreleased raw PDF/video captures in the local public directories cannot leak into this auth build. Immutable pinned assets use hardlinks to avoid duplicating gigabytes; the importer writes atomically so later refreshes cannot change an existing build through a shared inode. Cross-filesystem builds fall back to ordinary copies.

## Local checkpoint results — November 3

194 API/source checks, 30 unit tests, TypeScript, build/lazy assets, handoff links, lint (inherited warnings) and zero-vulnerability dependency audit pass. The four-width synthetic sign-in suite passes PKCE, single callback exchange, cancellation, invalid JWT rejection, own-record empty/linked states, read-only School Affairs chat, transcript clearing, local logout and Nexus preservation. The portal suite passes all 25 menu views / 94 links / 23 automated accessibility-layout states, with zero app errors, serious/critical findings or external requests. Its obsolete source-iframe selector and opaque-frame fixture initialization were corrected; the focused source-frame regression passes. Live client verification passes protected owner/profile, 106 migrations/RLS, anonymous denial, reversible CRUD cleanup, Edge authentication/CORS, account directory and OpenAI QA. Live Google is still unverified; these fixtures are not counted as real provider acceptance.
