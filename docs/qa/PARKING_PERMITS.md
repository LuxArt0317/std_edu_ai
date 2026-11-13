# Parking permits

The General Affairs permit item opens the 46-1 entry. The source has a 50 px dark header, centered application button, authentication guidance and a separate PDF instructions page. The local version follows that layout and uses text for the two sign-in steps. Existing private notes are reachable from the entry footer.

The application button opens the university parking system. It requires two-stage university authentication. The instructions view uses the university’s current PDF and provides a direct link. The source instructions also offer a POST acknowledgment labeled 閱讀完畢. The local viewer provides a direct PDF link and a return link. The acknowledgment continuation, protected form and personal application status remain unverified.

## Verify

- Build with `npm run build` and run `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/parking-permits-ui.mjs`. Expect General Affairs navigation, the separate instructions view, its PDF frame, private notes, four viewport widths and three guest sign-in redirects.
- Run `node --experimental-strip-types --test tests/api/parking-permits.test.ts`. Expect Chinese and English permit and instructions questions to link to the correct local routes. Status queries must not return a public navigation answer.
- Run `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5184 node tests/integration/school-affairs-ui.mjs --inventory-only`. Expect navigation through all 94 catalog entries. This checks destinations and does not certify all workflows.

## Production

Revision `097a814325db30406f53f679d506bc05a1e08f14` is live as Vercel `3d5hzNXKX62BAHb746RuxhvUMGB4`. The manifest was built at 15:57:59 UTC on November 13, 2026. Quality run 43457492094 succeeded.

The pinned browser suite passed the menu, separate instructions, all four widths, notes and three guest routes. That suite used synthetic account records and a stub PDF response. A separate production Chromium run retrieved the real university PDF (HTTP 200, `application/pdf`, no referrer). Four English and Chinese assistant questions returned the exact expected local links. The public shell passed eight routes and 50 assets.
