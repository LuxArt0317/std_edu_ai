# Moodle course section placement — Issue #98

## Source and behavior

The authenticated source capture `artifacts/visual-parity/dtm-course-reference-content.jpg` shows three ordered sections: assignments, examinations and course materials. An assignment-type activity appears in the examination section. The earlier renderer incorrectly inferred section from activity type and always rendered examinations as empty. The capture remains ignored; private source titles and deadlines are not seeded into fixtures or committed.

`dtm_course_contents` stores an administrator-managed ordered list of existing assignment/material references per owned course. Section placement does not change the underlying activity type or create a quiz engine. Unplaced records remain visible in deterministic default sections. Removed or moved activities are omitted from the student projection and counted for explicit administrator repair; reads never alter stored placement.

The student course uses a complete paginated inventory with a full-course revision. It rejects inconsistent pages, missing later pages, foreign scopes and oversized responses instead of displaying an incomplete course as complete. Exact assignment links use a separate own-course lookup, so an activity absent from the general workspace's first batch still opens the existing submission page. Personal tracker status is not treated as a submission result.

Maintenance stays inside the guarded existing administrator route. Save/delete use expected versions and request IDs; an uncertain response preserves the exact request for reconciliation. Closing the content panel retains its draft. Course/student selection is locked while a draft or uncertain save is pending. No student section editor is added.

## Verification

Applied migration: `20261114010000_dtm_course_content.sql`. Runtime c68650147e403da367bda1b599c8aabdfef8a052 is published; Vercel ErFd6zWT5pwTHEgCt51s5w3jZQmT is Ready and Quality43428235159 succeeded.

- Focused exact-assignment hook: 4 cases passed, covering account/route/client changes, aborts, retry, absent records and foreign response rejection.
- Actual API handlers with synthetic adapters: 6 groups passed, covering Google identity, strict query and mutation envelopes, paired pagination, administrator access, exact RPC selectors and uncertain writes.
- Backend contract tests: 14 groups passed. Isolated TypeScript/API build and production asset verification passed.
- Isolated full API/source suite: 985 passed; serial units: 519 passed. Build/assets, handoff (103 documents) and dependency audit (zero vulnerabilities) passed. A redundant hook state update was then removed; its 4 focused cases passed again.
- Independent compiled student UI: six groups passed at 1533/768/390/320px with no overflow, unexpected requests or page errors. Measured source shell columns differ by at most 0.0175 CSSpx. Evidence: `artifacts/dtm-course-content-ui/2026-11-13T12-17-45.385Z/result.json` in the isolated candidate. Administrator lifecycle is covered by nine DOM tests; compiled administrator browser coverage is not claimed.
- Initial rollback-only preflight failed during synthetic fixture setup (`23514`), before any content operation. Its invalid personal assignment-material combination activated an existing sample-only seed trigger. Exact rollback verification passed, owner/schema were preserved at134migrations/151RLS, and the connection closed. Original log: `/tmp/stu-course-content-preflight.log`. That failed attempt did not weaken or apply schema; the later independently reviewed correction and successful preflight are recorded below.
- Final compiled student rerun passed the same six groups against `index-CLQAAyap.js`; no new runtime lint warnings. The later deployed round trips are recorded below.

## Commands

```sh
node --experimental-strip-types --test tests/api/dtm-course-content*.test.ts
npx tsx --tsconfig tsconfig.unit.json --test tests/unit/dtm-course-assignment.test.tsx
node tests/integration/dtm-course-content-ui.mjs --self-test
```

Live harnesses require an explicit root-owned serialized lease, exact client identity and reviewed fixture recovery. No model calls, official-school writes, real student imports or Issue #100 assistant changes are part of this batch. The broader protected-system clone is unfinished.

Second preflight `/tmp/stu-course-content-preflight-corrected.log` failed after exactly180seconds in the broad administrator phase, with3accepted transactional writes and `cleanupVerified:false`, `connectionClosed:true`. Offline evidence identifies the watchdog as the likely cause, not a proved product assertion. The failed result is retained; subsequent read-only recovery and the bounded correction are recorded below.

Read-only recovery at12:34:54UTC passed:134migrations/151RLS, newobjects/migration absent, synthetic Auth/profile/student-prefix and contentaudit counts zero, protected administrator available, zero datawrites and closed connection. Evidence: `artifacts/dtm-course-content-recovery/watchdog-readonly.json`. This does not reconstruct the missing historical fingerprint or relabel the failed run.

The batched preflight (`2149c60c…`) passed all six groups in 140,963 ms, with exact fixture, schema, history, legacy-data and protected-owner restoration and a closed connection. Only the selected migration was then applied. Post-apply verification confirmed 135 migrations / 152 public RLS tables, stored SQL equality and zero initial content/receipt rows. Database-only client owner CRUD and anonymous-boundary checks passed and cleaned their fixture. Local actual-JWT acceptance subsequently passed as recorded below.

Local actual-JWT run `ed3d6e78-de02-40ec-929f-99aa7429f4a8` passed five groups, 59 handler requests and six successful writes. Concurrent duplicate requests, version conflicts and save/delete races passed. Exact fixture cleanup, protected-owner/unrelated-data preservation and closed connections passed. Evidence: `artifacts/dtm-course-content-http/local-ed3d6e78-de02-40ec-929f-99aa7429f4a8/result.json`. No browser, model or official-school requests were made by that harness.

## Published acceptance

Runtime c68650147e403da367bda1b599c8aabdfef8a052 is published and Vercel Ready as ErFd6zWT5pwTHEgCt51s5w3jZQmT. The public release manifest matches (built 2026-11-13T12:50:29.513Z) and Quality43428235159 succeeded. Pinned production actual-JWT acceptance passed five groups / 60 HTTP requests / seven successful writes, including concurrent requests and stale versions; exact fixture cleanup, protected-owner/unrelated-data preservation and closed connections passed. Pinned compiled student UI passed six groups and four screenshots at1533/768/390/320 with zero overflow, page errors, unexpected requests or live API/auth/model calls. Entry index-CLQAAyap.js matched before and after. Database135migrations/152publicRLS is verified. The requested floating panel remains removed and the live chatbot opens/closes. Compiled administrator-browser coverage remains unverified; nine DOM lifecycle tests pass. Issue100 stays user-paused with no file changes or model calls. Full protected-system parity is unfinished.

- Production API result: `artifacts/dtm-course-content-http/production-dbd2a737-9dac-4d8b-aa98-379b64f9bced/result.json`. Five groups, 60 deployed requests and seven successful writes; exact cleanup and closed connection, no cleanup failures. This harness uses real caller JWTs against synthetic targets, without browser/model/official-school requests.
- Production UI result: `artifacts/dtm-course-content-ui/2026-11-13T12-52-31.876Z/result.json`. Six groups, four screenshots, 43 mocked API reads; zero live API/auth/model calls, unexpected requests, page errors or cleanup failures. Browser closed.
- Release: [Vercel](https://vercel.com/v1-d286/std_edu_ai/ErFd6zWT5pwTHEgCt51s5w3jZQmT), [Quality](https://github.com/LuxArt0317/std_edu_ai/actions/runs/43428235159). Source-to-runtime revision and compiled entry matched before and after acceptance.

- Public deployment smoke passed: two compiled API method boundaries, homepage plus ten audience documents (no injected panel, chatbot frame retained), eight application routes with50assets each, and missing-asset404 behavior. No provider/model calls. Log: /tmp/stu-course-content-shell-production.log.
