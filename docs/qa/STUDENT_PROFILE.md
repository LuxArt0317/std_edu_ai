# Student information confirmation

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks the protected workflows. The signed-in source for service 8-1 uses an 11-row table with one editable field, the mobile number. The capture retained only layout measurements and field names. The university submission outcome remains unobserved. [University form](https://info.stu.edu.tw/aca/student/NEWSTU/mtnStuData.asp)

The [stu.best form](https://stu.best/school-affairs/services/8-1) reads a baseline for the authenticated student's account. An empty account shows an empty state. A student can keep the existing mobile number or save a new one with confirmation. A protected administrator can select a student under **學生基本資料管理** on the School Affairs administration page. Updating the baseline requires a fresh student confirmation. Baselines and confirmations are saved in Supabase. No school record values were imported.

Only the final four characters of an identity number can be stored. The read and write functions require a Google-linked account. The administrator function also verifies the protected owner. Row-level security and revoked direct grants prevent direct table access. Private receipts contain revision and time, with a digest for replay. The chatbot calls the status-only reader and links to the form. The status response excludes names, phone numbers, addresses and identity numbers.

## Verification

```sh
npm run db:plan -- --only=20261114210000
node tests/integration/student-profile-db.mjs --rollback-preflight
node tests/integration/student-profile-db.mjs --deployed
node --experimental-strip-types tests/integration/student-profile-http.mjs --verify-client
PUBLIC_SITE_ORIGIN=http://127.0.0.1:5184 node tests/integration/student-profile-ui.mjs
```

The rollback and deployed modes require the exact client connection. Run the rollback preflight before applying the migration. The live HTTP suite creates and deletes disposable accounts by verified IDs. The browser suite uses test fixtures and checks menu navigation, the observed desktop geometry, mobile overflow, Escape, replay, administrator editing, and guest sign-in return.
