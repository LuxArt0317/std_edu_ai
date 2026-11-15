# Student leave evidence for the campus assistant

[Issue #100](https://github.com/LuxArt0317/std_edu_ai/issues/100). The signed-in browser and API select the read-only leave scope before the LangGraph review. Controlled API and compiled browser checks passed. Actual Preview fixture execution remains pending.

- The resolver distinguishes native history, archived history, periods and an exact edit record. The archived view uses the native cutoff before August 1, 2019. The history and periods screens include both older and newer rows.
- The date range selects records overlapping both stated bounds. Relative dates are calculated in Asia/Taipei. Where the user leaves a date or identity unresolved, the result asks for the missing scope before the record reader can start.
- The row and exact-count requests validate the signed-in caller, selected service, record type, date bounds, optional UUID, category, and saved row state. No account initializer is called. No contact phone, free text, attachment, attendance or grade is queried.
- Local review status comes only from requested, caller-owned, general requests with identifiers saved on the selected leave rows. A missing or unreadable linked request stays unavailable. The saved record state remains separate from review status, and a resolved review provides no university approval or attendance result.
- The reader preserves authorized fields when linked review evidence is unavailable. Transport errors and mismatched record coverage have their own states. A count-only question reads an exact filtered count and emits zero record rows.

## Runtime and live verification

1. Resolve signed-in requests in the browser dispatcher and API with `studentLeaveLookupContext`. Preserve the native path and latest turn. If context excludes the requested collection, never send the original unfiltered prompt to the generic private planner.
2. Handle foreign, ambiguous and unsupported leave clauses before snapshot loading. An excluded foreign clause never removes the caller's valid requested fields. Tuition balances, the next class and native Moodle grades use their own scoped readers. Other independent parts receive an explicit scope clarification.
3. Add `leaveRecords` to supplemental lookup with the parsed selection copied into `readStudentLeaveEvidence(account,{selection,deadline})`. The existing broad `serviceRecords` lookup can initialize records and return notes. A scoped leave request must skip that path and use only the caller identifier or exact companion reader.
4. For an independent evidence review, require selected-field references for a saved row, `/counts/matching` for a count-only question, and exact read-state references for absence or unavailable evidence. A retry reloads the same scoped readers with the same selection. No unfetched detail should appear in an answer or record card.
5. Mount two disposable account bindings and verify both sides of owned/foreign access, submitted versus local state, timeout/empty, and the fresh-read/correction path through the signed-in API before granting release acceptance. The unmounted questions and compound reads remain explicit open evaluation cases.

## Offline verification

The controlled API test runs the real handler and LangGraph with intercepted record and model requests. It verifies the named Clinic leave case, linked review status, fresh retry, scoped companions, protected result cards and guest return destinations. Compiled browser checks submitted scoped prompts from history, archive, periods and exact edit at 1440 and 390 pixels, intercepting authenticated dispatch.

Run `node --test tests/evaluation/student-leave-native-cases.test.mjs` using Node 24. The suite executes 48 named offline checks and uses injected, synthetic PostgREST responses. The strict command for declarations is `tsc --ignoreConfig --noEmit --strict --target es2022 --module nodenext server/studentLeaveEvidenceIntent.d.ts server/accountStudentLeaveEvidence.d.ts`.

The whole-project runner lists 42 native Student Leave cases, including concrete paths for the index, archive, periods and one exact edit record. It reports the cases as setup failures until independently bound fixtures and request observations are available. A pinned manifest, saved runtime verdict, or compiled client transport test cannot supply that evidence. Nine existing leave questions and their original oracles remain in the denominator with explicit pending fixture bindings.

Run `node --test tests/evaluation/student-leave-runner.test.mjs` for the runner admission, independent grading, and compiled client transport checks. These checks use injected responses and never contact the assistant or create fixtures.
