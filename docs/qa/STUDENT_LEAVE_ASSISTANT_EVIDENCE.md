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


## Isolated fixture lifecycle

`student-leave-fixture-plan.mjs` reserves deterministic form and request IDs for two independently verified disposable Google-linked student identities. It stages exact synthetic rows for the ordinary, archive, relative-date, sibling, dated-history, count and named snapshots. The raw read probes cover each direction of caller and target for both tables. Crossed probes use the target's actual owner filter and valid row IDs, so an empty result can demonstrate isolation instead of a query mismatch. The fixture's scoped evidence excludes notes, phone and raw review identifiers.

`student-leave-fixture-lifecycle.mjs` uses the existing run lease, exact Preview and protected-owner proof patterns. `student-leave-fixture-journal.mjs` writes an owner-only, append-only, fsynced chain of intent and result records. A transition records its intent, then records that mutation may start only after the transaction establishes the exact previous state. Recovery can reconcile an exact state that the journal authorized or the empty state. It cannot adopt lookalike or partially changed rows.

The adapter must perform the transaction on the same serialized connection with safe isolation. Its exact delete statements must compare every saved cell, including null and timestamps, and return the exact removed rows. The scoped read includes all rows owned by the two accounts, globally reserved IDs, and forms referencing any reserved review ID. Delete the forms before their requests. Unexpected references, audit rows or field changes stop deletion. Cleanup verifies the exact scope is empty and repeats the protected-owner and identity checks. It can finish under the same lease after a Preview access failure. This workflow neither creates nor deletes Auth accounts.

| Existing case group | Count | Supported by this change | Outstanding for live execution |
| --- | ---: | --- | --- |
| Leave data | 18 | Exact route, range, field and row binding, including filtered empty | Scoped live executor and request-bound observations |
| Boundary or navigation | 14 | Exact request binding and controlled API behavior | Trusted proof of zero unintended reads or mutations |
| Relative Taipei dates and counts | 3 | Exact dataset and controlled read at the reference time | Independently pinned request clock or a reviewed time-aware case binding |
| Companion readers | 5 | Leave state for the four questions that request it | Independently bound charges, next class or Moodle grade records |
| Explicit unavailable or partial | 2 | Distinct correctly seeded forms and linked review | Trusted, bounded failure injection for the exact read, plus observations |
| Existing legacy cases | 9 | Named leave dataset for three cases, all original oracles retained | Exact case rebinding or an explicit missing capability, including the mixed missed-lesson question |

The exported `studentLeaveFixtureManifest.cases` lists all 51 case IDs with their exact obligations. It grants no live admission. The provider adapter must bind each fresh caller session to the run, prove the pinned revision, carry out the bounded database operations, and collect trusted request-correlated observations of raw reads and projected evidence. Normal fixture preparation and the evaluator admission guard remain unchanged. A deployable response or a valid raw probe cannot substitute for those observations.

Run `node --test tests/evaluation/student-leave-fixture-lifecycle.test.mjs` with Node 24. The 13 controlled checks include 21 data cases through the normal selector and reader, 14 boundary cases through the handler, both-owner readbacks, unknown-commit recovery and guarded cleanup. They make no provider requests.

## Offline case binding and request observation

`student-leave-offline-adapter.mjs` exercises the 18 exact leave-data cases and 14 boundary or navigation cases. It rejects the 19 cases whose clocks, companion records, targeted failures or legacy bindings are unresolved. The canonical questions and report admission remain unchanged. A correctly formatted leave UUID can begin with a hexadecimal letter or contain numeric date-like fragments. The runtime now identifies the full token before interpreting a name or a date.

The adapter takes separate injected request and observer functions. It verifies the fixture before opening the observer and immediately after closing it. Each window has its own nonce and binds the run, exact Preview origin, database project, release revision, suite, caller, row digest, question, route and history. The observer must independently capture the authenticated caller, request digest, handler correlation ID and response digest. It counts reader entries and raw PostgREST requests separately from captured attempt details. Each read attempt must match the exact caller, URL, projected columns, response range and row digest, followed by the independently captured projected evidence DTO. The adapter independently computes that expectation from the fixture and frozen case. Boundary and navigation cases require a complete window with zero scoped or unrelated reads, model calls and side effects.

A receipt from this adapter describes controlled offline execution. It carries `answerBehaviorEvaluated: false` and `liveAcceptance: false`. The focused test uses the real handler and reader, then injects a controlled answer stage and blocks network transport. A production observer would need permissioned ingress and full request-scoped egress/evidence instrumentation, protected by the pinned release and lease. A callback that can copy the plan, omit traffic, forge authenticated owner proof or rewrite both dispatched and observed values can manufacture a receipt. Never admit live runs from these callback receipts, a response correlation header alone, or SSE/model claims. The live runner stays closed until a separately trusted collector provides complete request-correlated observations and authenticated fixture transport.

Run `node --test tests/evaluation/student-leave-offline-adapter.test.mjs` with Node 24. The checks cover all 32 eligible cases, exact UUID parsing, prior request replay, duplicate correlation, substituted responses, extra and missing reads, scoped retry, boundary side effects and fixture drift.
