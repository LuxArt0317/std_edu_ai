# API contract checks

Run with `npm test`. `affairs-assistant.test.ts` covers School Affairs directory breadth, account isolation, personal-record limits and image validation; the other suites cover protected and public API contracts.

`assistant-stream.test.ts` checks that directory activity precedes the final result and that the browser reader handles split frames and incomplete streams. `affairs-assistant.test.ts` also checks private DTM account progress after verified auth.
