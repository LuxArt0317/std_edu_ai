# Course withdrawal and restoration

[Issue #98](https://github.com/LuxArt0317/std_edu_ai/issues/98) tracks this workflow. The [university’s course-selection handbook](https://wpc.stu.edu.tw/wp-content/uploads/sites/21/2024/08/STU113%E6%96%B0%E7%94%9F%E9%81%B8%E8%AA%B2%E6%89%8B%E5%86%8A_1130820.pdf), pages 27–28, describes selecting a current course, confirming withdrawal, retaining the marked row and restoring the course during the same window. The current protected screen returned to sign-in, so the local screen uses the observed course-system layout. Exact screen parity and the current university schedule remain unverified.

## Account workflow

- The School Affairs menu and course-selection index open `/school-affairs/services/6-4`. A Google session is required.
- The page uses the caller's explicit current-term withdrawal-phase records. Existing course-selection history reflects the same saved remark. Withdrawal writes `Y(W)`, and restoration clears it. Other phase records, timetable membership and grades remain independent.
- The verified School Affairs administrator maintains the local term window and populates withdrawal-phase courses through the existing course-selection manager. No window or courses are seeded. A blank remark is eligible for the local withdrawal action during the window. Other literal remarks remain visible and unchanged.
- Both changes require explicit confirmation, a matching version and a durable request ID. The server checks the window against Taipei academic terms and accepts it from the opening instant until just before closing. The assistant reads current saved records and window state.
- A stu.best withdrawal changes the stu.best course record. It has no university submission integration.

## Verification

Production revision `91d97d35ee2acc56b0e531f81006a42d2a26b34f` passed the browser and eleven real-account API checks. Successful withdrawal and restoration were exercised in the exact-client rollback and in the synthetic browser flow. The production HTTP run exercised owner reads, assistant answers, unauthenticated and cross-account denial, malformed payload rejection and student denial for the administrator action.

The full local portal suite passed 25 menu views, 94 catalog destinations and 27 responsive/accessibility states. An earlier run timed out on the legacy search route because the Vite preview served the copied homepage for the `.asp` URL. The final run used the corrected preview fallback.

Run these from the client checkout. The first check uses an exact-target rollback, including window changes. The second uses disposable accounts and removes them afterward. The browser uses synthetic records and separately checks the public assistant handoff on production.

```sh
node tests/integration/course-withdrawal-db.mjs --deployed
node --experimental-strip-types tests/integration/course-withdrawal-http.mjs --verify-client
node tests/integration/course-withdrawal-ui.mjs
```

The browser requires the built preview at `http://127.0.0.1:5184`. For a production run, set `PUBLIC_SITE_ORIGIN=https://stu.best` and `EXPECTED_RELEASE_REVISION` to the verified deployment commit. The HTTP suite also uses production when the revision is supplied. Expect all three checks to pass with zero disposable account, session, identity or course rows left behind.
