# Service Leadership and assistant destinations

The authenticated source index exposes unit preselection, placement confirmation, lecture lookup and assignment and grade lookup. The local index matches the measured 962 px frame and sidebar/main placement at 1280 px. Each local entry page preserves its corresponding university destination. The protected university forms and populated records remain unverified.

The assistant's subject evidence now points to an account-owned enrollment view with today's timetable, the next class and term filtering. It reads the existing enrollment records, using the same Taipei calendar calculation as the assistant. Existing leadership notes are reachable from the index footer. Moodle material citations use the exact local course and material route, using only included course and material IDs.

## Verification

- Build with `npm run build` and run `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/service-leadership-ui.mjs`. Expect four distinct destinations, four viewport checks, private notes, a populated subject destination and guest sign-in.
- Run `node --test tests/evaluation/evidence-links.test.mjs`. Expect evidence links to stay within the included records and exact local routes.
- Run `node --experimental-strip-types --test tests/api/service-leadership.test.ts`. Expect the leadership, Moodle resource and subject destinations to pass.
