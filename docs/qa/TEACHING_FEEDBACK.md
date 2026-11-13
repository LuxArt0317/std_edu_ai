# Teaching evaluation and immediate feedback

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) · [Teaching evaluation](https://stu.best/school-affairs/services/7-5) · [Immediate feedback](https://stu.best/school-affairs/services/7-6)

The university handbook describes separate midterm and final evaluations and immediate feedback during the enrolled term. It also describes withholding final evaluation results until grades are published. The authenticated forms could not be inspected after the university session expired. The two stu.best pages implement those workflow distinctions using local fields and layout. [University handbook, pp. 50 and 53](https://wpc.stu.edu.tw/wp-content/uploads/sites/21/2024/08/STU113%E6%96%B0%E7%94%9F%E9%81%B8%E8%AA%B2%E6%89%8B%E5%86%8A_1130820.pdf)

- Survey windows and questions are set per term and phase. Each student can submit one evaluation per enrolled section in an open window. The completion receipt and survey responses are stored separately. Response rows have no account identifier or submission timestamp. The application shows completion, and students should omit identifying details from optional comments.
- Immediate feedback requires an active enrollment in a current term. The student can see their submitted text and review status. The administrator’s review queue shows the course and comment without account identifiers. It does not forward anything to an instructor or the university.
- Administrators can release class results after the window ends. Final release requires an explicit confirmation that grades are published. Only groups of five or more responses are shown, and comments load for a specific released class. The current app uses administrator review and aggregate access. An instructor-facing workflow, official enrollment or grade synchronization, and the university’s exact questionnaires remain open.
- The campus assistant can answer signed-in questions about completion and review status in English or Traditional Chinese. It does not include raw feedback or survey comments in its response. Signed-out visitors receive a return-to-service sign-in link. Migration 20261114140000 seeds no survey or feedback data.

## Verification

- `node tests/integration/teaching-feedback-db.mjs --rollback-preflight` runs the migration and student and administrator writes in an exact-client rollback transaction. Use `--deployed` to test the installed schema. Coverage includes authorization, independent enrollments, separate response and completion storage, release suppression, and replay.
- `node --experimental-strip-types tests/integration/teaching-feedback-http.mjs --verify-client` runs against the handlers with real Supabase sessions and removes the exact disposable fixtures. Set `EXPECTED_RELEASE_REVISION` to test that production revision.
- `node tests/integration/teaching-feedback-ui.mjs` tests both compiled routes, confirmations, replay, persistence on reload, assistant routing, administration, mobile layout, and the sign-in return. The default preview is `127.0.0.1:5184`. Set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` for the deployed build. Browser data is intercepted, while real persistence is covered by the API and database suites.

## Deployed evidence

Production `623baac` is live as Vercel `BitJQgNJxjJfq4pKmbmFqTZDZt7d`. Migration 20261114140000 was applied alone, bringing the client to 148 migrations and 169 RLS-protected public tables. The pinned browser, 20 actual-JWT API requests including two successful student writes and their replays, exact fixture cleanup, guest assistant links, and eight public shell routes passed. Quality 43504926483 passed. The 94-destination local navigation inventory has 41 generic and 15 partial entries. Administrator release was verified in the rollback transaction and intercepted browser.
