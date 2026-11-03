# Integration checks

Run focused integration scripts through the `test:*` commands in the root `package.json`. `school-affairs-entry-ui.mjs` exercises the isolated Google session and assistant drawer with synthetic provider fixtures; it does not establish a real Google callback.

The School Affairs entry check also verifies the local campus carousel at four viewport widths, automatic rotation, arrows, pause behavior and reduced-motion defaults.
