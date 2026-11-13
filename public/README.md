# Public assets

The copied public pages no longer include the floating green disclosure/account-status panel or its iframe. `direct-school.css` retains the assistant and responsive source-page styling; standard School Affairs and DTM sign-in routes remain available.

Vite copies this directory into the site root. `favicon.png` is the 150 × 150 university crest advertised as the favicon on the official `www.stu.edu.tw` homepage; it is byte-identical to the source-verified copy at `stu-reference/f66cc8b7e3555676.png`. `apple-touch-icon.png` uses the matching 500 × 500 original from `school-assets/5e2bccf79181a67fd811.png`. The captured school assets and their source/checksum manifests remain under those folders. `direct-school.css` styles the standalone school pages, responsive homepage hero/header and floating assistant control; `direct-school-assistant.js` handles only closing the same-origin assistant popover. Captured source scripts remain excluded.

`stu-reference/` also contains the 16 public School Affairs login photos. Their source URLs, local paths and SHA-256 checksums are listed in its `provenance.json`.

[`dtm-theme/`](dtm-theme/README.md) contains the self-hosted Moodle activity icons, default avatars and Open Sans font used by the signed-in DTM layout.

The copied-page assistant frame in `direct-school.css` uses the same full-height right-side presentation as the native assistant:512px on desktop and the full viewport below640px. `reference.css` adapts the embedded component to that frame; authentication and conversation behavior remain in the existing runtime.
