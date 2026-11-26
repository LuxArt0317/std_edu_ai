# Assistant memory checks

Run `node --experimental-strip-types --test tests/memory/assistant-memory.test.ts` from the repository root. Checks cover rolling-context survival, owner isolation, verified-only admission, missing-source/credential exclusion, guest session-only persistence and malformed-storage recovery. They do not establish end-to-end model recall quality or cloud persistence.
