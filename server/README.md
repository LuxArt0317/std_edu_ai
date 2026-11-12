# Server helpers

Shared server-only retrieval, authorization and validation helpers for `api/`. `schoolAffairsDirectory.js` reads the captured School Affairs catalog; `schoolWebSearch.js` verifies public STU web sources. These modules do not grant access to official school systems.

`schoolWebSearch.js` classifies both singular and plural personal class questions before public search. Nexus answers those questions from the caller's verified account context; anonymous research hands them to School Affairs sign-in.

`affairsWorkspace.js` reads DTM and service records through the verified caller's token and RLS. `dtmAnswer.js` produces account-specific links, filters unfinished work and uses the meeting foreign key to find assignments for a missed class. `schoolAffairsDirectory.js` gives public navigation links with verified campus sources.

`assistantStream.js` emits only observed lookup stages as SSE events, with a JSON fallback for older clients. It is shared by public and School Affairs assistant endpoints and does not transmit model reasoning.

`affairsSchedule.js` calculates current, past, future, today and next classes from account enrollments in Asia/Taipei time. `affairsAnswer.js` uses those records plus account-scoped assignments and charges for common personal questions. `affairsWorkspace.js` calls the audited manager RPC through the verified caller token; it never uses a service key for browser requests.

`scholarshipRecords.js` maps caller-scoped scholarship records and answers status, award, service-hour and period questions locally. Explicit assignment, DTM, leave, internship and other account topics supersede scholarship page/history context. Scholarship applications and manager context are excluded from generative-model input. The manager resolves every applicant profile in bounded ID batches; ordinary snapshots retain the caller-only filter.

`studentAidRecords.js` and `housingRecords.js` map private records and produce deterministic answers with local service links. Personal form/contact/health data and admin snapshots are excluded from model input. Explicit other-service questions supersede the page context. Housing replies include application receipts, window status and assigned beds/fees; student-aid replies distinguish unknown amounts from zero.

`courseCatalog.js` validates authenticated catalog queries and admin writes through caller-JWT RPCs. Catalog questions route to the offering catalog rather than substituting enrolled courses. Catalog rows never enroll an account.
