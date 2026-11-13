# Parking permits

The General Affairs permit item opens the 46-1 entry. The source has a 50 px dark header, centered application button, authentication guidance and a separate PDF instructions page. The local version follows that layout and uses text for the two sign-in steps. Existing private notes are reachable from the entry footer.

The application button opens the university parking system. It requires two-stage university authentication. The instructions view uses the university’s current PDF and provides a direct link. The protected form and personal application status were not observable.

## Verify

- Build with `npm run build` and run `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/parking-permits-ui.mjs`. Expect General Affairs navigation, the separate instructions view, its PDF frame, private notes, four viewport widths and three guest sign-in redirects.
- Run `node --experimental-strip-types --test tests/api/parking-permits.test.ts`. Expect Chinese and English permit and instructions questions to link to the correct local routes. Status queries must not return a public navigation answer.
- Run `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5184 node tests/integration/school-affairs-ui.mjs --inventory-only`. Expect navigation through all 94 catalog entries. This checks destinations and does not certify all workflows.
