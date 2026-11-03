# Helpful school search — Issue #86

## Answer flow

`/api/research-assistant` checks published, eligible public knowledge first. If it has no useful evidence, the question asks for current information, or eligible sources conflict, the server searches live `stu.edu.tw` and its subdomains with OpenAI's hosted web-search tool. A second bounded search can use broader sources about Shu-Te if the official search yields no accepted answer. It gives a direct, source-backed answer where possible and explicitly narrows any unknown detail. All web sources are labeled as live sources, not as approved knowledge-base documents.

The authenticated `/api/school-assistant` has the same public web fallback in read-only QA mode, after validating the School Affairs session and loading server/RLS account context. Public web requests contain only the public question; they never contain the account JWT, user ID, private records, attachments, assistant responses or private conversation turns. Personal subjects, grades, schedules, balances and messages still require an authorized account record; Google sign-in alone does not import official school data. Agentic actions remain role-checked and confirmation-gated.

The web answer parser requires an actual completed `web_search_call`. Every cited HTTPS URL must appear in the tool's source metadata or URL-citation annotations; invented/unsafe links reject the answer. It also accepts a sourced partial answer when an exact detail is unavailable, includes corroborated links from answer text, removes tracking parameters and deduplicates citations. Web citations have no reviewed date, approved corpus chunk ID or research-feedback token. They must not be counted as curated evaluation evidence. The interface marks them “Found online” and shows the links. Hosted web search may fail, time out or return insufficient evidence; the assistant then gives a practical school link or focused next step without claiming a verified fact. Clearly unrelated coding requests are redirected to campus help.

## Configuration and limits

The existing server-only `OPENAI_API_KEY` is required. Optional `OPENAI_SEARCH_MODEL` overrides the public/model setting for web search; otherwise the server uses `OPENAI_PUBLIC_MODEL`, then `OPENAI_MODEL`, then the existing default. Do not place any OpenAI key in Vite or browser storage. No database schema or new browser permission is required.

Official-domain filtering is by `stu.edu.tw` subdomain, including the registrar and departmental sites. Broader web results are explicitly labeled external even when relevant. Searches do not prove that a source is institutionally approved or that an old announcement is current. Website retrieval and source owners remain subject to the existing open research acceptance issues. No arbitrary school question can be guaranteed an answer if trustworthy evidence is unavailable.

## Verification

- `npm test` covers missing managed evidence, retrieval outages, real tool-result citation binding, unsafe URLs, Chinese/English scope, private follow-up isolation, and unrelated coding requests.
- `npm run test:unit`, `npm run test:school-affairs-entry`, `npm run test:school-affairs`, `npm run build`, `npm run lint` and `npm run verify:handoff` cover UI, session, build and documentation regression gates.
- Production acceptance asked a current library-hours question in English and Chinese. The deployed provider performed completed web searches, returned actual STU source metadata, and the API returned `grounding.source === "web"` with clickable official citations. The final English reply used English and one canonical source (12.7 seconds). The official linked hours page returned 403, so neither the assistant nor this QA claimed an unverified opening time. Public browser chat opened, submitted a Chinese school question and displayed a readable answer and clickable source. A private-grade question produced the authorized-record sign-in handoff with `webSearched:false`; an unrelated coding request produced campus-only guidance without web search. Production source `26166bb`, Vercel `CNYWCeXWMycuUeXpGfchmE2mcTCU` Ready, quality run `41567024916` successful. The local suite passes 209 API/source tests and 30 units. This is live provider acceptance for the fallback, not a guarantee that every inaccessible school page can be answered.

Official OpenAI web-search tool documentation: <https://developers.openai.com/api/docs/guides/tools-web-search>.
