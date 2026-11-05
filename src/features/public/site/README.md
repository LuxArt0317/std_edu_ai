# Public site reference helpers

`reference.ts` resolves captured STU asset URLs to local files using `assets.json` and maps supported public school links to local routes. The asset map includes all 16 School Affairs login carousel URLs; SHA-256 provenance is stored with the files in `public/stu-reference/provenance.json`.

`reference.css` also sizes the assistant sheet to its same-origin popover frame when `/campus-assistant?embed=1` is opened from a copied public page.
