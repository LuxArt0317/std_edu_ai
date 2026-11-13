# Service Leadership and assistant destinations

The authenticated source index exposes unit preselection, placement confirmation, lecture lookup and assignment and grade lookup. The local index matches the measured 962 px frame and sidebar/main placement at 1280 px. Each local entry page preserves its corresponding university destination. The protected university forms and populated records remain unverified.

The assistant's subject evidence now points to an account-owned enrollment view with today's timetable, the next class and term filtering. It reads the existing enrollment records, using the same Taipei calendar calculation as the assistant. Existing leadership notes are reachable from the index footer. Moodle material citations use the exact local course and material route, using only included course and material IDs.

## Verification

- Build with `npm run build` and run `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/service-leadership-ui.mjs`. Expect four distinct destinations, four viewport checks, private notes, a populated subject destination and guest sign-in.
- Run `node --test tests/evaluation/evidence-links.test.mjs`. Expect evidence links to stay within the included records and exact local routes.
- Run `node --experimental-strip-types --test tests/api/service-leadership.test.ts`. Expect the leadership, Moodle resource and subject destinations to pass.

## Production acceptance

Vercel deployment `2quFSpWu4S8jXu4dEEEjNQcN9t57` serves revision `636c7512aec9466de7994558ff47d7b9eff6bb7f`, built on 2026-11-13 at 15:40:11 UTC with `index-BVK78oDy.js`. GitHub Quality run 43454524772 succeeded.

- The revision-pinned Chromium suites passed the leadership index and four entries, four viewport widths, saved notes, subject destination, guest sign-in, and six Moodle URL resource checks. They used synthetic account records.
- Five live public assistant questions returned the exact local leadership links in Chinese and English, through the directory.
- The public shell passed eight routes, 50 assets and both assistant runtime startup checks.
- Local QA passed 1,005 API and source checks, 541 unit tests, 380 offline evaluation tests, and navigation through all 94 catalog entries. The inventory counts 55 generic and five partial entries. This release applies no migrations.
- The official portal displayed its inactivity prompt and returned to CAPTCHA after refresh. The four protected leadership forms are still unverified.
