import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const out = resolve("artifacts/tutorials/exports");
const data = JSON.parse(await readFile(resolve(out, "chapters.json")));
await writeFile(
  resolve(out, "START-HERE.txt"),
  "STU Nexus video guides\n\nOpen index.html for the role gallery, or open an MP4 directly. Teacher and Student are the main onboarding chapters. 00-complete-walkthrough.mp4 combines all six chapters.\n\nAll videos include English speech and burned-in captions; matching SRT files are available. Demonstration accounts and synthetic records are used. Live navigation is labeled and pauses may be shortened. AI guidance requires human review. No measured time savings or institutional approvals are asserted.\n\nFinal uninterrupted viewer/listening acceptance remains a client review step. Public confirmation-mail capacity is a separate application setup dependency.\n",
);
const files = [
  "index.html",
  "START-HERE.txt",
  "CHAPTERS.txt",
  "chapters.json",
  "00-complete-walkthrough.mp4",
  "00-complete-walkthrough.srt",
  "00-complete-walkthrough.vtt",
  ...data.chapters.flatMap((x) => [
    x.file,
    x.file.replace(".mp4", ".srt"),
    x.file.replace(".mp4", ".vtt"),
  ]),
];
await rm(resolve(out, "STU-Nexus-Video-Guides.zip"), { force: true });
execFileSync(
  "zip",
  [
    "-q",
    "-0",
    "-j",
    resolve(out, "STU-Nexus-Video-Guides.zip"),
    ...files.map((x) => resolve(out, x)),
  ],
  { stdio: "pipe" },
);
console.log(
  JSON.stringify({
    archive: "STU-Nexus-Video-Guides.zip",
    files: files.length,
    includesCredentials: false,
  }),
);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const e of entries) {
    if (["node_modules", ".git"].includes(e.name) || e.name.startsWith("."))
      continue;
    const p = dir + "/" + e.name;
    if (e.isDirectory()) paths.push(...(await walk(p)));
    else if (e.isFile()) paths.push(p);
  }
  return paths;
}
await writeFile(
  "artifacts/tutorials/RESTORE-EDITABLE.txt",
  "Merge media/ and artifacts/ into the existing client checkout. Follow media/tutorials/SETUP.md. Cached audio and recordings can render without contacting ElevenLabs or the live database. Fresh speech/capture requires your private environment files. This archive excludes credentials, sessions and dependencies. Use the Video-Guides archive for ready-to-watch exports.\n",
);
const editable = [
  ...(await walk("media/tutorials")),
  ...(await walk("artifacts/tutorials/assets")),
  "artifacts/tutorials/narration.json",
  "artifacts/tutorials/captures.json",
  "artifacts/tutorials/RESTORE-EDITABLE.txt",
];
await rm(resolve(out, "STU-Nexus-Editable-Media.zip"), { force: true });
execFileSync(
  "zip",
  ["-q", "-0", resolve(out, "STU-Nexus-Editable-Media.zip"), ...editable],
  { stdio: "pipe" },
);
console.log(
  JSON.stringify({
    archive: "STU-Nexus-Editable-Media.zip",
    files: editable.length,
    includesCredentials: false,
  }),
);
// One portable handoff: the ready-to-watch bundle also carries the editable archive.
execFileSync(
  "zip",
  [
    "-q",
    "-0",
    "-j",
    resolve(out, "STU-Nexus-Video-Guides.zip"),
    resolve(out, "STU-Nexus-Editable-Media.zip"),
  ],
  { stdio: "pipe" },
);
