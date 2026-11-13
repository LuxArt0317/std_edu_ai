# Integration helpers

`school-service-route-inventory.mjs` declares the expected final destination, mount and scope for all 94 School Affairs menu links. Its five offline contracts reject missing/duplicate inventory entries and preserve the distinction between navigation coverage and completed workflows. Run `node --test tests/integration/helpers/school-service-route-inventory.test.mjs` without credentials.

`native-http-response.mjs` reads bounded JSON for native service acceptance suites and reports safe HTTP/MIME/platform error categories without retaining private response bodies. Its offline contracts live in `tests/evaluation/native-http-response.test.mjs`. It performs no requests or credential loading by itself.
