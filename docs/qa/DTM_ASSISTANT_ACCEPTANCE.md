# School Affairs and DTM assistant acceptance — Issue #93

Verified on 2026-11-06 against a simulated, account-scoped Google session. The test user and course records are fixtures, not official STU enrollment.

| Question / scenario | Pass criterion | Check |
| --- | --- | --- |
| Anonymous asks for a personal course or email | No account snapshot; sign-in required | `questionKind` and existing public API tests |
| Signed-in asks “What are my current subjects?” | Returns only caller's sample School Affairs courses, clearly labeled | `tests/api/affairs-assistant.test.ts` |
| Signed-in asks “What DTM materials do I have?” | Returns caller's DTM preview course materials, not Nexus content | Same API test |
| Signed-in asks “what are all my school details” | Includes signed-in email, sample student and School Affairs/DTM subjects | Same API test |
| Signed-in asks “what details do you know about me” | Acknowledges actual stu.best sample account fields | Same API test |
| Signed-in asks “what tools do you have?” | Lists read and confirmation-gated stu.best actions, denies official Moodle access | Same API test |
| Signed-in asks about a public School Affairs menu | Uses the public directory without sending the bearer token or private history | Same API test |
| DTM overview, course page, responsive layouts | Three columns at desktop, stacked on phone, zero overflow or serious accessibility violations | `tests/integration/dtm-ui.mjs` |

The private answer path verifies the Supabase Google token and loads only the caller's RLS-scoped sample records. Questions mentioning the caller or the assistant's account tools remain on that path. Public lookup receives no bearer token or private conversation history. Direct profile/capability answers use deterministic snapshot rendering so model wording cannot deny records the site just read. Other private questions can use the configured model with a database-grounded fallback.

**Limit:** This matrix does not prove connection to the university's Moodle or School Affairs systems. Official DTM homepage labels are dated references. Actual Moodle assignments, grades, submissions, per-user notifications and enrollment require an authorized integration and separate acceptance checks. A test using simulated records cannot establish an individual user's official courses.

## Protected reference inspection on November 12, 2026

The active university Moodle session opened a course and its user grade report through the visible course tree. At a 1533 CSS-pixel viewport, both use a 344.53-pixel left column at x=20 and a 1110.17-pixel main column at x=402.83, beginning at y=166. Course contents group assignment activities, examination activities and materials in a white panel. The grade report includes item, weight, score, range, percentage, rank, feedback and contribution columns. Unavailable local grade dimensions must stay blank; course totals require an actual grading policy.

The international-scholarship application page was also inspected through the authenticated School Affairs menu. Its observed fields are application period, term, review status/explanation, award amount, required service hours and completed hours. Its policy permits cancellation during the application period before review. The implementation uses account-owned local applications and administrator-published local periods. The original university application was inspected read-only.

The full prior E2E run completed with 51 passing scenarios. The focused course/grade suite checks the measured desktop column coordinates within one CSS pixel and exercises 1533, 768, 390 and 320-pixel viewports, activity dialogs, assignment create/edit/delete, grade editing and keyboard table scrolling. The overview suite also checks the shared session, assistant and 1440-pixel layout. Both passed without serious or critical accessibility violations.

The scholarship database preflight and post-migration checks passed application/reapplication, stable retry receipts, stale-version rejection, award/service-hour reviews, closed-period and reviewed-record guards, account isolation, anonymous denial and direct-write denial. All test changes rolled back. Migration `20261112030000_scholarship_applications.sql` is applied to the client database, bringing it to 113 migrations and 124 RLS-protected public tables. The 242 API/source tests and 34 unit tests pass. Production browser acceptance is recorded in the release handoff once complete.

The real concurrency suite forced overlapping requests on separate PostgreSQL backends. Duplicate request IDs produced one stable application/receipt/audit; competing version-zero applications, cancellation/review, and administrator period creation produced exactly one successful writer and one conflict. The existing owner authorization was verified without changing the owner account. All disposable records were removed and absence was checked.
