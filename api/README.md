# HTTP API

## Account conversations and verified replies

`affairs-data.ts?resource=conversations` (public alias `/api/affairs-conversations`) supports owner-only list/read/save/delete with the School Affairs Google session. Saves enforce a 190KB request limit, bounded text/history and database version checks. `affairs-assistant.ts` selects account evidence and runs the bounded LangGraph verification loop; `research-assistant.ts` verifies generated knowledge/web/image answers. `affairs-action.ts` accepts an optional reviewed-action `requestId` and uses durable receipts for replay protection. None of these endpoints borrow Nexus credentials or execute a write during answer verification.


Vercel serverless endpoints live here. `research-assistant.ts` answers public school questions from governed knowledge, the captured service directory, images, and verified web sources. `affairs-assistant.ts` verifies a separate School Affairs Google session and never loads Nexus records; `school-assistant.ts` remains the protected Nexus operating assistant.

`affairs-data.ts` returns personal DTM and service records for the same verified Google identity. `affairs-action.ts` validates edits, imports and site review requests before passing them to owner-scoped database functions. Anonymous callers receive HTTP 401 for the private account endpoints.

`affairs-manage.ts` accepts audited, admin-only sample enrollment, charge and assignment updates. Database authorization checks the verified Lux Google identity and each linked student's record. The private assistant routes school-record follow-ups to account data and does not send that data to the public research endpoint.

Native academic grades, modern/legacy graduation reports and attendance share these endpoints. Eight manager operations use versioned database RPCs; the graduation report alone has a 140KB HTTP envelope for its strictly validated nested content. Private assistant evidence preserves requested record types and terms, literal values and local links without treating Moodle scores as academic transcripts. See [native acceptance](../docs/qa/ACADEMIC_RESULTS.md).

Assistant POST requests may set `stream: true` to receive server-sent `progress` events followed by one `result` or `error` event. Older JSON clients keep the same response contract. Private progress starts only after the Google bearer token is verified; public lookups never receive that token.

The public research entrypoint is a thin wrapper around `server/researchAssistantHandler.js`, shared by the School Affairs assistant. Runtime cross-function imports must target deployable JavaScript helpers. `npm run test:live-shell` verifies both compiled endpoints start before exercising page assets; method-denied checks do not call a provider.

Syllabus requests use the explicit `syllabus-search`, `syllabus-options` and `syllabus-detail` scopes. Metadata writes use the strict `syllabus-metadata` manager kind; unknown prefixed scopes and additional fields fail closed. Both routes share a17-second request deadline for these operations.
