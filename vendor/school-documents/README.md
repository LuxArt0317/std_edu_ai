
The archive remains pinned to its original 401-document key. Three later, tracked
PDFs are declared in `manifest.json` as `supplementalDocuments`, with exact asset
path, byte count and SHA-256. Restoration validates those files in the target
before reading the archive, excludes them from the archive entry set, and fails
if they are absent, corrupt or disagree with the reviewed asset manifest. This
keeps fresh-checkout restoration compatible without rebuilding the large bundle.
Verify this boundary with `node --test tests/evaluation/school-document-supplements.test.mjs`.
