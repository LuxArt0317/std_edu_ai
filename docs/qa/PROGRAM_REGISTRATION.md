# Interdisciplinary program registration

Academic Affairs service 7-3 opens a dedicated registration table. The [university screen](https://info.stu.edu.tw/ACA/student/AppIntraCourse/index.asp) displayed the ten-column history and an add link. The signed-in reference account had an empty history and the add link exposed no visible form. The local add and progress pages therefore use the published catalog and local account state. Layout comparison for those additional pages and source-backed course-level completion remain open.

Registering and withdrawing update the signed-in stu.best account. The interface confirms the program and action before either write. The database preserves one record per account and program, rejects stale versions, and returns the original receipt on an exact retry. Academic year and semester come from the Taipei date. University registration periods, submissions and approvals are separate. Staff completion is displayed if recorded in the database and is unavailable to student writes.

The assistant can answer “Which interdisciplinary programs have I registered for?” from the caller’s history. The guest assistant links to School Affairs sign-in. Saved tracking notes remain on a separate local route.

The rollback suite checks owner isolation, non-Google and anonymous access, payload validation, stale writes and durable retry receipts. The actual-JWT suite runs against disposable accounts and verifies exact fixture cleanup. The browser suite covers the catalog link, source shell width, mobile containment, confirmation, retry, refresh, withdrawal, notes, guest return and signed-in assistant routing.

Production `76c117c6c7ad0839f4dac7e7be9981c121280ea3` is live. The pinned browser suite and 19 actual-JWT API checks passed with exact cleanup and preserved owner state. The first production attempt saw the prior manifest during rollout, then passed on the published revision.

To repeat the pinned browser check from the client checkout:

```sh
PUBLIC_SITE_ORIGIN=https://stu.best EXPECTED_RELEASE_REVISION=76c117c6c7ad0839f4dac7e7be9981c121280ea3 node tests/integration/program-registration-ui.mjs
```
