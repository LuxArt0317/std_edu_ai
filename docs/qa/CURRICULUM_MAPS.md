# Curriculum maps

The Academic Affairs menu opens `/school-affairs/services/12-7`. The layout and four colleges follow the [university curriculum-map directory](https://info.stu.edu.tw/ACA/student/CM/cm.asp). Each of the 42 observed departments opens a local overview with the source artwork and actions. The course route sends the selected academic year and track to the university’s public read-only query. The server validates the selectors and returned headings, then extracts text into structured tables. An empty source result remains empty.

The department links, selectors and source reference are in `src/features/public/affairs/curriculumMaps.json`. The source images are local. The descriptive text is paraphrased, the detail layout reflows at small widths, and existing account notes have a separate link. Career and competency pages keep their distinct destinations and hand off to the university’s sign-in because the source requires a school session.

## Verify

- Build with `npm run build`, then start `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/curriculum-maps-ui.mjs`. Expect 42 overviews, four screen widths, two filter combinations, an error and successful retry, private notes, and a guest sign-in redirect.
- Run `node --experimental-strip-types --test tests/api/curriculum-maps.test.ts`. Expect fixed destination validation, inert extraction, strict year and track matching and rejection of unexpected responses.
- In Academic Affairs → System list and search, open **課程地圖查詢**, select **資訊管理系**, then choose **課程路徑**. Submit year **115** and **創新應用**. The returned semester map should show **程式設計**.

## Production acceptance

Vercel `7rWzSFj1NcpqxtgZdEMdEdYVT4zP` serves `a549676389fcdc39ebd267f471fbe84e5bbd7fad` with `index-CW2_ZJw1.js`. Revision-pinned Chromium accepted all 42 overview routes, four widths, notes, guest sign-in, two real queries and an injected error with successful retry. Production returned 17 and 22 course items for the two tested selections and zero for the tested empty map. Both live assistant questions returned the local link. The public shell passed eight routes and 50 assets.

The real local handler returned 43 successful selections. Nineteen default selections were populated, 23 were empty, and the separate historical selection was populated. A repeat unit run failed an existing assistant-session isolation assertion under load. The next full run passed all 541 tests.
