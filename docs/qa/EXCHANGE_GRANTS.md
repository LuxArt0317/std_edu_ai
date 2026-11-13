# Exchange and conference grants

The Student Affairs catalog entry for service 23-1 opens a standalone index with four destinations and a locally served [operation manual](/stu-reference/grants/operation-manual.pdf). The receipt route reproduces the observed return to the index with a local notice.

The conference draft fields follow the university’s [public operation manual](https://info.stu.edu.tw/SAO/SCA/sampleFile/opMenu.pdf). Each reflection attaches to the owner’s saved draft. An account needs a verified Google identity to read or change records. A draft stores activity details and text, and retains its report when the draft is edited. The student number remains blank until a verified student linkage is available. The saved workflow covers stu.best drafts and reflections. Current university application forms, participant rosters, university submissions and receipt issuance remain outside this release.

## Verification

- Run `npm run build`, then serve the output on port 5184 with `npm run preview -- --port 5184 --strictPort`.
- Run `node tests/integration/exchange-grant-ui.mjs` and expect five check groups. The browser uses synthetic API records.
- Run `node tests/integration/exchange-grant-rls-live.mjs --rollback-preflight` only before applying the migration to the configured client database. Expect the test transaction to roll back and the baseline to match.
- After the migration, `node --experimental-strip-types tests/integration/exchange-grant-http-live.mjs --local-handlers` exercises the actual client database through the API handlers. The production mode `--deployed` requires the exact `EXPECTED_RELEASE_REVISION`. Each mode signs in disposable accounts and verifies their cleanup.
