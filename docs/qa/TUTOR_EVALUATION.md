# Teaching assistant and tutor evaluation

- Catalog 25-1 and 25-2 open the same student index. The observed report route returned to the index after a notice. Self-evaluation opened a no-questionnaire event page. The local report notice uses neutral wording because the alert text was unavailable.
- Catalog 28-1 renders the observed ten ratings and optional comment. The questionnaire belongs to the signed-in account. One completed response per questionnaire version is kept in Supabase and reappears read-only after reload. Retries reuse the original request ID.
- Verified linked student fields are read by an exact-scope RPC. Unavailable profile fields are left blank. The questionnaire stores only ratings and comments in stu.best.
- The assistant gives local links for TA reports, TA self-evaluation and the tutor questionnaire. Populated TA forms and university submission remain unverified.

## Production evidence

Revision `de1ad601e35067d869787ab26a45d5535c1347a6` is live at stu.best. The exact manifest matches Vercel deployment `AYbVzPorwGJwzcmdy4cNa3i4gmbn`. Pinned production QA passed 15 real-JWT requests with exact cleanup, six browser groups at four widths, eight public routes and 50 assets. All three live assistant navigation answers returned local links. Only migration `20261114050000` was applied after rollback verification. [GitHub Quality run 43450755675](https://github.com/LuxArt0317/std_edu_ai/actions/runs/43450755675) passed.

## Verification

- Start the compiled preview on port 5184 with `npm run build` and `npm run preview -- --port 5184 --strictPort`. Run `node tests/integration/tutor-evaluation-ui.mjs`. Expect six passing groups, including required ratings, retry, reload and guest/account isolation.
- Before migration, run `node tests/integration/tutor-evaluation-rls-live.mjs --rollback-preflight` against the configured client database. Expect exact rollback and passing database authorization checks.
- After migration, run `node --experimental-strip-types tests/integration/tutor-evaluation-http-live.mjs --local-handlers`. Production verification uses `--deployed` with `EXPECTED_RELEASE_REVISION` set to the exact production revision. Expect 15 API checks and verified fixture cleanup.
