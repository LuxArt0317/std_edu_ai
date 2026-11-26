# Assistant memory checks

Run `node --experimental-strip-types --test tests/memory/assistant-memory.test.ts` from the repository root. Checks cover rolling-context survival, owner isolation, verified-only admission, missing-source/credential exclusion, guest session-only persistence and malformed-storage recovery. They do not establish end-to-end model recall quality or cloud persistence.

`server-memory.test.ts` verifies server-only admission, user/service credential separation, generation propagation, evaluator bypass and store failures. `database.sql` is destructive and must run ONLY in a new disposable PostgreSQL cluster: create empty auth/role stubs and load the migration at `/tmp/migration.sql`; it checks owner isolation, unforgeable writes, cap, expiry and clear fencing. It must never run against a shared/cloud database. The build runs the Node tests using `npm run verify:assistant-memory`; SQL requires the separate disposable database gate.

`turn-control.test.ts` checks FIFO queue bounds/immutability and meaningful-event commentary selection. Browser verification confirmed immediate acknowledgment, pending-message removal and sequential automatic dispatch. Steering was subsequently removed per user direction; it is not an available control.
