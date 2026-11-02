import { spawn } from "node:child_process";
import { mkdir, writeFile, stat } from "node:fs/promises";
import {
  createFixtures,
  cleanupFixtures,
  statePath,
} from "../e2e/client-fixtures.mjs";
import { clientResearchEnvironment } from "../helpers/client-research-session.mjs";
await clientResearchEnvironment();
try {
  await stat(statePath);
  throw Error(
    "A fixture session is already active. Finish it before running serialized research QA.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir("artifacts/research-client", { recursive: true, mode: 0o700 });
const suites = [
  "research-foundation-live",
  "ingestion-telemetry-live",
  "ingestion-api-live",
  "knowledge-ingestion-live",
  "knowledge-acquisition-live",
  "campus-routing-live",
  "research-study-runner-live",
  "rag-evaluation-live",
  "research-rls-matrix-live",
  "research-operations-live",
  "research-adversarial-live",
];
const rows = [];
let failed = false;
try {
  await createFixtures();
  for (const name of suites) {
    if (
      process.env.RESEARCH_SUITE &&
      !process.env.RESEARCH_SUITE.split(",").includes(name)
    )
      continue;
    const started = Date.now();
    console.log(JSON.stringify({ suite: name, status: "running" }));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", `tests/integration/${name}.mjs`],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      const timer = setTimeout(() => child.kill("SIGTERM"), 480000);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
    await writeFile(
      `artifacts/research-client/${name}.log`,
      result.stdout + result.stderr,
      { mode: 0o600 },
    );
    rows.push({
      suite: name,
      passed: result.code === 0,
      seconds: (Date.now() - started) / 1000,
    });
    await writeFile(
      "artifacts/research-client/results.json",
      JSON.stringify(rows, null, 2),
    );
    console.log(JSON.stringify(rows.at(-1)));
    if (result.code !== 0) {
      failed = true;
      break;
    }
  }
} finally {
  await cleanupFixtures();
}
if (failed)
  throw Error(
    "Research QA failed. Inspect the private per-suite report before continuing.",
  );
