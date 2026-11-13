# Early graduation

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [School Affairs service 7-4](https://stu.best/school-affairs/services/7-4)

The Academic Affairs menu opens the captured closed-period page and nine-column history. The university’s published notice documents eligibility, identity confirmation, and online submission. The captured source had an empty history. Open-period controls, the cancellation dialog, and populated history were unavailable for visual comparison. The observed notice and table are the design reference. [University notice for 114-2](https://www.stu.edu.tw/latestnews-single/?id=213134)

The stu.best administrator can set a Taipei-time application window and save a candidate’s eligibility and academic identity. An eligible signed-in student can review the saved identity, confirm submission during the current term’s window, and cancel a pending application during that window. The local review result and application history remain visible on reload. The assistant reads the same saved application window, eligibility and history in English or Traditional Chinese. A signed-out question about personal status links to sign-in and returns to service 7-4. There is one local application per account and term. Administrator approval is a stu.best review result.

The migration seeds no windows or student records. PostgreSQL enforces the verified Google identity, restricted administrator scope, version checks, and durable request replay. The student’s identity is snapshotted on submission. The previous personal notes are available at `/school-affairs/services/7-4/notes`.

## Verification

- `node tests/integration/early-graduation-db.mjs --rollback-preflight` exercises the migration and successful writes inside a rollback-only transaction before applying it. Use `--deployed` after applying it to exercise the same actions with the installed schema. The test verifies that disposable identities and changes disappear after rollback.
- `node --experimental-strip-types tests/integration/early-graduation-http.mjs --verify-client` verifies handlers with disposable accounts and real Supabase JWTs. Set `EXPECTED_RELEASE_REVISION` to run against that exact production revision. This suite confirms read permissions, the assistant answer, and rejected mutations without opening a production application window. Successful mutations are exercised by the database rollback test.
- `node tests/integration/early-graduation-ui.mjs` exercises compiled navigation, closed and open states, responsive history, Escape, submit, retry, cancel, assistant, administration and the guest return path with intercepted data. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` for the deployed bundle.

## Deployed evidence

Production `a29243d` is live as Vercel `6CJvUKQBqEDqw8SDwm4WBoDkkS4i`. Only migration 20261114130000 was applied, bringing the client to 147 migrations and 167 public RLS tables. Pinned browser with desktop/mobile contrast checks, 14 actual-JWT requests with exact cleanup, guest assistant handoff and eight public shell routes passed. The local full portal suite checked all 94 links and 25 menu views. Quality 43500735647 passed. The 94-destination inventory has 43 generic and 13 partial entries.

At 1,280 CSS pixels the closed-page frame, blue bar, and notice origin matched the measured source. The notice was about 14 CSS pixels shorter and the history table started about 12 CSS pixels lower. The gray header was darkened to meet contrast requirements. The populated and open states use the documented local design.
