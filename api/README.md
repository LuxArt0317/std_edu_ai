# HTTP API

Vercel serverless endpoints live here. `research-assistant.ts` answers public school questions from governed knowledge, the captured service directory, images, and verified web sources. `affairs-assistant.ts` verifies a separate School Affairs Google session and never loads Nexus records; `school-assistant.ts` remains the protected Nexus operating assistant.

`affairs-data.ts` and `affairs-assistant.ts` also return DTM preview records for the same verified Google identity. DTM content is sample-only; anonymous callers receive HTTP 401 for the private account endpoints.
