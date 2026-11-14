# Summer course selection

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [Eligibility](https://stu.best/school-affairs/services/6-5) · [Academic year 114 notice](https://stu.best/school-affairs/services/6-5/notice?year=114)

The university entry opens an identity-check page. The signed-in reference available on November 14 showed a missing college code, with the 163 × 147 crest and the notice on one line at desktop width. The eligible registration and payment screens remain unobserved.

Service 6-5 reads a decision owned by the Google-linked School Affairs caller, keyed to a ROC academic year and the summer semester. The administrator uses **Course adjustment eligibility** and chooses **Summer selection** to save a decision. The saved missing-college result uses the observed screen. An absent decision is shown as unverified. An eligible decision links to the existing summer selection history with the academic year and summer phase preselected.

The separate notice uses published data keyed to its year. The 114 notice records NT$1,522 per credit or per teaching hour for a zero-credit course, a minimum of 12 paid registrations, and the registration and refund rules. The notice does not supply terms for other years. [Academic Affairs notice](https://www.stu.edu.tw/latestnews-single/?id=213145)

Migration `20261114200000` extends the existing eligibility table and audited mutation to the summer phase and adds the public notice table. The existing row-level policies, caller-bound receipt and revision checks apply. The assistant reads private eligibility and public notices separately.

## Verification

- `node tests/integration/course-adjustment-db.mjs --summer-deployed` verifies the installed migration in a rollback transaction, including old and new phases, account isolation and retry behavior.
- `node --experimental-strip-types tests/integration/course-adjustment-http.mjs --verify-client --summer` verifies real authenticated HTTP handlers and removes its disposable accounts.
- `node tests/integration/summer-selection-ui.mjs` verifies the source-shaped notice, retry, mobile fit, preserved sign-in return, assistant and exact summer history link. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` for the deployed browser.
