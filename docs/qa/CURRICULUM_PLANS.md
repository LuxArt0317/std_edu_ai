# Historical curriculum plans

[The university lookup](https://info.stu.edu.tw/ACA/teacher/QryCoursedept/qrydeptCourse.asp) was captured on November 14, 2026 in Asia/Manila. The indexed JSON records the exact source URL and HTML SHA-256 for each of the 24 tables. The 12 program tabs preserve the observed order. Each has a current and archive view. Blank cells stay blank. The 1,516 document cells contain 1,441 distinct plan codes. Published curriculum is separate from individual enrollment.

The local document page previews the university PDF through an allowlisted, read-only endpoint. The preview fails closed on upstream redirects, non-PDF responses, over 4.4 MB or a 12-second deadline. The university download link stays available. Only a sample of PDF responses has been verified live.

The local logo, title graphic, and PDF icon came from `images/stu_logo.png`, `images/title.png`, and `images/pdf.png` under the source lookup directory. SHA-256 values in that order:

- `fcaeff2e4ae3dff163127c11d2ad2d71f4495628e0e4b565d6a6bddd0b876710`
- `d894c0ce279b5f42aa76eb0daa390cd6ccc8245d45c6db02f65d80b35cc6e8ef`
- `27420ea72e036ea1511bf0a0a4b263a02a2bf52ecd0e297c05ea1d50e7bb218a`

## Verify

- Build with `npm run build`, then start `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/curriculum-plans-ui.mjs`. Expect 24 matrices, four widths, the local plan preview, existing private notes, and three guest gates.
- Run `node --experimental-strip-types --test tests/api/curriculum-plans.test.ts`. Expect validation of the captured tables, exact assistant destination, strict query and method checks, and rejection of invalid or oversized PDF bodies.
- In Academic Affairs → System list and search, open **歷年課程規劃查詢**. Choose a program, open the archive, and select a department-year cell. The document opens at a local route and offers the direct university download.
