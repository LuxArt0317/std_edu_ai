# Integration helpers

`native-http-response.mjs` reads bounded JSON for native service acceptance suites and reports safe HTTP/MIME/platform error categories without retaining private response bodies. Its offline contracts live in `tests/evaluation/native-http-response.test.mjs`. It performs no requests or credential loading by itself.
