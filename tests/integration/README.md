# Integration checks

Run focused integration scripts through the `test:*` commands in the root `package.json`. `school-affairs-entry-ui.mjs` exercises the isolated Google session and assistant drawer with synthetic provider fixtures; it does not establish a real Google callback.

The School Affairs entry check also verifies the local campus carousel at four viewport widths, automatic rotation, arrows, pause behavior and reduced-motion defaults.

`school-home-layout-ui.mjs` checks all ten homepage entrance cards at twelve desktop, tablet and phone widths. It fails when a title or description crosses its card, the page scrolls sideways, or the expected responsive grid does not render. Set `STU_BASE_URL` to a running local preview or `https://stu.best`; screenshots and JSON results are ignored under `artifacts/site-mirror/home-layout/`.

`school-mirror-navigation.mjs` holds a captured stylesheet open to verify that copied content and links work before full iframe load. It also simulates a missing capture returning the application shell and requires a clear error. Run it with `npm run test:school-mirror-navigation`; the full `test:school-mirror` command includes it.
