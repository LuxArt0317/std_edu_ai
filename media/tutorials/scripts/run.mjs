import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
process.chdir(root);
const action = process.argv[2];
const allowed = new Set([
  "narrate",
  "capture",
  "prepare",
  "render",
  "verify",
  "seed-demo",
  "cleanup",
  "finalize",
  "setup-demo",
  "gallery",
  "scribe-qc",
  "verify-roles",
  "package",
  "verify-audio",
  "verify-gallery",
]);
if (!allowed.has(action)) throw Error("Unknown tutorial action");
await import("./" + action + ".mjs");
