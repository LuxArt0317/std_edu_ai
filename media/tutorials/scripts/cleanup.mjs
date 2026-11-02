import { cleanupFixtures } from "./demo-fixtures.mjs";
await cleanupFixtures();
console.log(
  JSON.stringify({
    temporaryAccountsRemoved: true,
    isolatedRecordsRemoved: true,
    privateSessionStateRemoved: true,
  }),
);
