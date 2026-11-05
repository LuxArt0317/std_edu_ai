# Integration checks

Run focused integration scripts through the `test:*` commands in the root `package.json`. `school-affairs-entry-ui.mjs` exercises the isolated Google session and assistant drawer with synthetic provider fixtures; it does not establish a real Google callback.

`school-mirror-ui.mjs` also checks the direct homepage at 3020, 2048, 1440, 768, 390 and 320 pixels: the sticky header spans the viewport, navigation stays centered, one hero slide fills the carousel, and the page has no sideways scroll.

The School Affairs entry check also verifies the local campus carousel at four viewport widths, automatic rotation, arrows, pause behavior and reduced-motion defaults.

`school-home-layout-ui.mjs` checks all ten homepage entrance cards at twelve desktop, tablet and phone widths. It fails when a title or description crosses its card, the page scrolls sideways, or the expected responsive grid does not render. Set `STU_BASE_URL` to a running local preview or `https://stu.best`; screenshots and JSON results are ignored under `artifacts/site-mirror/home-layout/`.

`school-mirror-navigation.mjs` holds a captured stylesheet open to verify that direct copied content and links work without waiting for that stylesheet. `direct-school-assistant-ui.mjs` opens the same-origin assistant on the homepage, student page and a query-selected news page at desktop/mobile widths; it verifies a chat answer, Escape, close and reopen. Run it with `npm run test:school-mirror-navigation`; the full `test:school-mirror` command includes it.

`boot-recovery-ui.mjs` simulates an old HTML entry pointing to a removed JavaScript bundle. It requires a single automatic refresh to the current entry and checks the no-JavaScript fallback text. Run it with `npm run test:boot-recovery`; the full mirror command includes it. To exercise the compiled production HTML, set `BOOT_HTML_PATH=dist/app-shell.html` and `PUBLIC_SITE_ORIGIN` to a running `vite preview` URL.
