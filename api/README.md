# HTTP API

Vercel serverless endpoints live here. `research-assistant.ts` answers public school questions from governed knowledge, the captured service directory, images, and verified web sources. `affairs-assistant.ts` verifies a separate School Affairs Google session and never loads Nexus records; `school-assistant.ts` remains the protected Nexus operating assistant.

`affairs-data.ts` and `affairs-assistant.ts` also return DTM preview records for the same verified Google identity. DTM content is sample-only; anonymous callers receive HTTP 401 for the private account endpoints.

Assistant POST requests may set `stream: true` to receive server-sent `progress` events followed by one `result` or `error` event. Older JSON clients keep the same response contract. Private progress starts only after the Google bearer token is verified; public lookups never receive that token.
