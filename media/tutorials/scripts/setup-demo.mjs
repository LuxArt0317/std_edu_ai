import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../../../", import.meta.url)));
const { createFixtures } = await import("./demo-fixtures.mjs");
await createFixtures();
await import("./seed-demo.mjs");
