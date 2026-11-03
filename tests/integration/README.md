# Integration checks

Run focused integration scripts through the `test:*` commands in the root `package.json`. `school-affairs-entry-ui.mjs` exercises the isolated Google session and assistant drawer with synthetic provider fixtures; it does not establish a real Google callback.

The School Affairs entry check also verifies the local campus carousel at four viewport widths, automatic rotation, arrows, pause behavior and reduced-motion defaults.

`school-home-layout-ui.mjs` checks all ten homepage entrance cards at twelve desktop, tablet and phone widths. It fails when a title or description crosses its card, the page scrolls sideways, or the expected responsive grid does not render. Set `STU_BASE_URL` to a running local preview or `https://stu.best`; screenshots and JSON results are ignored under `artifacts/site-mirror/home-layout/`.
