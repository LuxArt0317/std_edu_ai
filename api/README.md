# HTTP API

## Account conversations and verified replies

`affairs-data.ts?resource=conversations` (public alias `/api/affairs-conversations`) supports owner-only list/read/save/delete with the School Affairs Google session. Saves enforce a 190KB request limit, bounded text/history and database version checks. `affairs-assistant.ts` selects account evidence and runs the bounded LangGraph verification loop; `research-assistant.ts` verifies generated knowledge/web/image answers. `affairs-action.ts` accepts an optional reviewed-action `requestId` and uses durable receipts for replay protection. None of these endpoints borrow Nexus credentials or execute a write during answer verification.


Vercel serverless endpoints live here. `research-assistant.ts` answers public school questions from governed knowledge, the captured service directory, images, and verified web sources. `affairs-assistant.ts` verifies a separate School Affairs Google session and never loads Nexus records; `school-assistant.ts` remains the protected Nexus operating assistant.

`affairs-data.ts` returns personal DTM and service records for the same verified Google identity. `affairs-action.ts` validates edits, imports and site review requests before passing them to owner-scoped database functions. Anonymous callers receive HTTP 401 for the private account endpoints.

`affairs-manage.ts` accepts audited, admin-only sample enrollment, charge and assignment updates. Database authorization checks the verified Lux Google identity and each linked student's record. The private assistant routes school-record follow-ups to account data and does not send that data to the public research endpoint.

Assistant POST requests may set `stream: true` to receive server-sent `progress` events followed by one `result` or `error` event. Older JSON clients keep the same response contract. Private progress starts only after the Google bearer token is verified; public lookups never receive that token.
