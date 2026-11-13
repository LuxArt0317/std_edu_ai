# Credit transfer application and history

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks this workflow. The university's published application form defines applicant categories, prior and requested course equivalencies, credits, required or elective status, and per-course decisions. The official process uses the printed form and supporting documents and passes through department and registrar review. The protected system currently redirects to sign-in. The earlier inspection saw a closed entry and empty history. The current open form, populated history geometry and official review screens remain unverified. [Academic Affairs instructions](https://www.aca.stu.edu.tw/%E6%8A%B5%E5%85%8D%E5%AD%B8%E5%88%86/) · [Published application form](https://wpc.stu.edu.tw/wp-content/uploads/sites/34/2021/02/%E6%8A%B5%E5%85%8D%E5%AD%B8%E5%88%86%E7%94%B3%E8%AB%8B%E6%9B%B8.pdf)

## Local workflow

- The Academic Affairs menu opens `/school-affairs/services/7-2`. Course-system history links open `/school-affairs/services/7-2/history`.
- A verified Google account can maintain one application per applicant category, with up to 20 course rows. A draft can be edited or printed. Submission sends the saved version to the local reviewer.
- The verified School Affairs administrator selects the student's account and records a transfer, waiver or rejection for each submitted course. The student sees the decisions after reloading history. The local review does not change transcripts or university records.
- The assistant reads the same saved applications. A missing record remains unknown outside stu.best. The workflow starts without seeded applications.
- Ownership comes from the verified session. Version checks reject stale changes and private receipts make identical retries safe. A first-time applicant can save without first visiting the School Affairs homepage.

## Verification

```sh
node tests/integration/credit-transfer-db.mjs --deployed
node --experimental-strip-types tests/integration/credit-transfer-http.mjs --verify-client
node tests/integration/credit-transfer-ui.mjs
```

The database suite runs in a rollback transaction against the exact client. The HTTP suite saves and submits using temporary Supabase sessions, then removes the application and receipts. The browser uses synthetic sessions for form, print, review, reload and responsive checks. It uses a built preview on port 5184 by default. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and the matching `EXPECTED_RELEASE_REVISION` for a pinned production browser run. The HTTP suite also uses production when the revision is supplied.
