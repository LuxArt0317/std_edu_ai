# Education Fund reference view

Issue [#98](https://github.com/LuxArt0317/std_edu_ai/issues/98). The exact native route `/school-affairs/services/21-2` is mounted behind the School Affairs Google sign-in gate. Nested and unknown service routes do not inherit this page.

The authenticated source `https://info.stu.edu.tw/sao/edufundli/student/index.asp` was inspected read-only on November 13, 2026. It showed six instruction sections and an application period of September 1, 2026 at 08:00 through October 12, 2026 at 20:00. No application form, personal record, upload or submit control was visible. Private source captures and computed measurements remain in ignored `artifacts/visual-parity/education-fund-source/`.

`EducationFundWorkspace` renders only this dated reference. It has no account data, network request, eligibility calculation, financial decision, editor or submission capability. Source text is kept literal in `educationFundContent.ts`, including the source-era agency names and wording. These are captured instructions, not current-policy defaults. The local footer reads `stu.best | 07-6158000#2401`; the capture date remains only in `data-observed-on` and this documentation. Its five links stay on local home, portal, sign-out and mySTU routes. It does not copy the university copyright or imply official issuance. The shared assistant host may independently load its conversation list; the instruction route does not load an account-record snapshot.

The desktop CSS follows the measured 1527px viewport: 962px outer frame at x282.5, 960px content box, 20px gray banner, 50px logo, 931.195px heading rule, 912px content area and 656.633px instruction column at x398.703. Local rendered comparison at 1527×1399 verified 21 element bounds against the saved source measurements, with a maximum difference of 0.015625px. At 390px and 320px the text column widens and the banner/footer wrap; the document and the frame, instructions and footer remain within the viewport. Desktop and mobile screenshots were inspected. The source red payment-method text is retained; its contrast on white is below WCAG AA for this font size. This geometry check is not a full image-diff or accessibility certification.

The logo reuses the existing registered T image at `/school-assets/03599fb12dbe1c0d2b5c.png` (610 bytes; SHA256 `9ec0b3674feed90fab05656e6083f046da9bf1ed4a60674eb2883ddfbc03b79b`). It visually matches the captured `../images/Tlogo.png`; equality with that specific Education Fund URL has not been verified. No new remote asset or provenance entry is added.

Offline verification passed on November 13, 2026: the five component tests plus five service-alias tests, focused TypeScript and Oxlint. Tests cover the observed instruction structure, absence of invented workflow controls, fixed dated reference semantics, local navigation, the existing asset hash and scoped desktop/mobile CSS.

The local browser harness is `tests/integration/education-fund-ui.mjs`. With an existing local Vite server, run:

```sh
PUBLIC_SITE_ORIGIN=http://127.0.0.1:5176 node tests/integration/education-fund-ui.mjs
```

It requires the ignored source measurement capture and installed Chrome (or `CHROME_PATH`). It uses synthetic Google authentication and empty account fixtures, fulfils the permitted local read requests, blocks external requests, API mutations and WebSockets, and closes its browser in `finally`. It does not start or stop the supplied server. Expected output is `Education Fund UI passed`; screenshots at 1527/390/320 and geometry/routing results are written to ignored `artifacts/education-fund-ui/`.

The harness verifies the exact native mount, four actual menu links (Education Fund, Leave form, Leave history and Internship), numeric aliases `20-1`, `33-1`, `53-1` preserving query/hash and replacing browser history, guest login gating, and unknown/nested route rejection. This is local rendered navigation acceptance only. It does not prove live OAuth, backend writes, deployed behavior, or the unobserved Education Fund application workflow.
