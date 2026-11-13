# Tuition-reduction history

Issue #98 covers the standalone `21-3` service. The authenticated source capture on November 13, 2026 showed five instructions, a closed application period, and a seven-column history table. The page links to the local copy of the accounting office. At 1280 px the notice and results table differ from the capture by at most 1.02 CSS px in the measured rectangles. The campus assistant remains available. The capture contained no open-period form or populated history rows.

The local account history stores the displayed values literally. Empty strings, missing cells, and zero text retain their original values. Successful empty history displays the source’s empty row. Failed or foreign responses display an error and allow retry. The existing generic notes stay available at `/school-affairs/services/21-3/notes`.

The administrator can create, edit, and delete rows for the selected student in `/school-affairs/admin/records`. Database row policies scope reads, and SQL enforces administrator access for writes. Writes require an expected version and a stable request ID. The protected read uses a single snapshot ordered by display order and ID.

## Checks

- `npm test` and `npm run test:unit` exercise the API and UI suites. The focused handler test checks selector rejection, caller scope, and strict write payloads.
- `node tests/integration/fee-remission-ui.mjs` verifies the compiled application on `http://127.0.0.1:5184`, using synthetic browser data. The source measurements are stored in the ignored `artifacts/visual-parity/fee-remission/source.json` capture.
- The rollback preflight exercised three database groups and verified the original schema, migration history, owner and fixture state. Only `20261114030000` was selected and applied. The local actual-JWT suite passed 15 API requests and three distinct audited writes, including retry, cross-account isolation and exact cleanup.

The compiled browser checks passed four groups at 1280, 390 and 320 px, including create, retry with the original request ID, edit and delete in the selected-student editor. An initial browser run timed out on the test’s account-picker locator. The corrected locator passed with the same application build. The published-release check is pending. Recorded values belong to the local account history. The source capture establishes the observed closed-period presentation.
