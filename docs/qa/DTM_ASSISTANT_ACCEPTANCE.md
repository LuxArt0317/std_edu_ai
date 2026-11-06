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
