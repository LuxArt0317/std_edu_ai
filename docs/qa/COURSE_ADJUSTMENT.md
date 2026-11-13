# Course add/drop and late add

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks these services. The signed-in university add/drop entry returned an ineligibility notice for the inspected session. The late-add entry showed two rules and linked to notices, followed by an alert and an identity-check screen. The eligible add/drop and late-add forms remain unverified.

- [Add/drop](/school-affairs/services/6-2) shows the signed-in account's saved local decision for the Taipei academic term. Missing data displays an unverified status.
- [Late add](/school-affairs/services/6-3) opens the dated rules and separate selection and fee notices. The phase link opens the caller's eligibility lookup.
- The existing School Affairs administrator can load and save a student's decision for a specific term and phase. Writes require the trusted admin role, an expected version, and a request ID. The browser preserves the same request after an uncertain response.
- The campus assistant cites the saved decision or the public rules. Personal questions require Google sign-in. The eligible state links to the university for enrollment. The local decision stores no university submission or seat reservation.

The source notice includes legacy browser and credential instructions. The local guidance summarizes the current workflow and omits those instructions. The [Academic Affairs FAQ](https://www.aca.stu.edu.tw/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C%EF%BD%9Cqa/) explains capacity limits and course-selection phases.

## Verification

```sh
node tests/integration/course-adjustment-db.mjs --deployed
PUBLIC_SITE_ORIGIN=https://stu.best EXPECTED_RELEASE_REVISION="$(curl -fsS https://stu.best/release.json | node -p 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).revision')" node tests/integration/course-adjustment-ui.mjs
```

The database check uses a rollback-only transaction against the exact client. It checks manager authorization, student isolation, scope, idempotent retries and stale writes. The browser uses synthetic accounts and real public notice and assistant endpoints. Set `CHROME_PATH` when using a Chromium executable other than the default macOS Chrome.
