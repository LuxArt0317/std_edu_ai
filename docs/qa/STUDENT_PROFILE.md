# Student information confirmation

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks the protected workflows. The signed-in source for service 8-1 uses an 11-row table with one editable field, the mobile number. The capture retained only layout measurements and field names. The university submission outcome remains unobserved. [University form](https://info.stu.edu.tw/aca/student/NEWSTU/mtnStuData.asp)

The [stu.best form](https://stu.best/school-affairs/services/8-1) reads a baseline for the authenticated student's account. An empty account shows an empty state. A student can keep the existing mobile number or save a new one with confirmation. A protected administrator can select a student under **學生基本資料管理** on the School Affairs administration page. Updating the baseline requires a fresh student confirmation. Baselines and confirmations are saved in Supabase. No school record values were imported.

Only the final four characters of an identity number can be stored. The read and write functions require a Google-linked account. The administrator function also verifies the protected owner. Row-level security and revoked direct grants prevent direct table access. Private receipts contain revision and time, with a digest for replay. The chatbot calls the status-only reader and links to the form. The status response excludes names, phone numbers, addresses and identity numbers.

When the signed-in student also asks for their recorded year, the assistant separately reads the year from that caller’s student record. It keeps the confirmed part of the reply if either read fails. A question about another student's profile is declined before dispatch. The controlled original-prompt replay runs with `node --experimental-strip-types --test tests/evaluation/student-profile-dispatch.test.mjs`.

Issue #100 adds the three unchanged Student Profile browser cases for confirmed, confirmed plus year, and empty accounts. The protected relay allows one scoped workspace bootstrap, one exact answer request, one journaled conversation write, and one read on fresh restoration. The answer and saved conversation include only confirmation status and any requested year. The fixture checks both callers and both crossed credentials against the status RPC and the narrow year read. It removes the reserved profile and student and verifies the sample rows created by the enrollment trigger are gone.

For controlled verification, run `node --experimental-strip-types --test tests/evaluation/student-profile-browser.test.mjs tests/evaluation/vercel-preview-browser-transport.test.mjs`. Set `STU_STUDENT_PROFILE_TEST_PGLITE_ENTRY` to the absolute PGlite module path for the migrated PostgreSQL checks, and `STU_STUDENT_PROFILE_TEST_CHROME` to Chrome’s executable for the compiled client dispatch check. These checks use disposable local records and controlled transport. Record protected Preview browser execution separately.

## Verification

The protected runner accepts `--client-dispatch student-profile` for the three read-only browser cases. It binds both callers' confirmation and year responses to separate authenticated Supabase reads before and after the browser turn. Each case verifies one conversation save and a reload, then disposes the exact records and both fixture accounts. `--client-dispatch protected-native` also includes the mounted certificate and Announcement Email cases.

```sh
npm run db:plan -- --only=20261114210000
node tests/integration/student-profile-db.mjs --rollback-preflight
node tests/integration/student-profile-db.mjs --deployed
node --experimental-strip-types tests/integration/student-profile-http.mjs --verify-client
PUBLIC_SITE_ORIGIN=http://127.0.0.1:5184 node tests/integration/student-profile-ui.mjs
```

The rollback and deployed modes require the exact client connection. Run the rollback preflight before applying the migration. The live HTTP suite creates and deletes disposable accounts by verified IDs. The browser suite uses test fixtures and checks menu navigation, the observed desktop geometry, mobile overflow, Escape, replay, administrator editing, and guest sign-in return.

## Deployed evidence

Production `1a52866` is live as Vercel `EpsnPz3VkbJd5ce8TzWFEbEuiDAU`. Migration 20261114210000 brings the client to 155 migrations and 183 RLS-protected public tables. The pinned browser, actual-JWT HTTP with exact cleanup, four bilingual guest assistant checks, eight shell routes and Quality 43545398160 passed. The 94-destination local audit reports 33 generic and 21 partial entries.
