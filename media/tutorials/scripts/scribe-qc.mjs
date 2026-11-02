import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const content = JSON.parse(await readFile("media/tutorials/content.json")),
  e = parseEnv(await readFile(".env.elevenlabs.local", "utf8"));
await mkdir("artifacts/tutorials/qc-speech", { recursive: true });
const target = "artifacts/tutorials/qc-speech/full-scribe.json";
try {
  await stat(target);
  console.log(JSON.stringify({ cached: true }));
  process.exit(0);
} catch {}
const paths = content.episodes.flatMap((x) =>
  x.scenes.map((s) => resolve(`artifacts/tutorials/assets/audio/${s.id}.mp3`)),
);
await writeFile(
  "artifacts/tutorials/qc-speech/concat.txt",
  paths.map((p) => `file '${p}'`).join("\n") + "\n",
);
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "artifacts/tutorials/qc-speech/concat.txt",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "artifacts/tutorials/qc-speech/narration-review.mp3",
  ],
  { stdio: "pipe" },
);
const f = new FormData();
f.set(
  "file",
  new Blob(
    [await readFile("artifacts/tutorials/qc-speech/narration-review.mp3")],
    { type: "audio/mpeg" },
  ),
  "narration-review.mp3",
);
f.set("model_id", "scribe_v2");
f.set("language_code", "en");
f.set("tag_audio_events", "false");
const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
  method: "POST",
  headers: { "xi-api-key": e.ELEVENLABS_API_KEY },
  body: f,
  signal: AbortSignal.timeout(240000),
});
if (!r.ok) throw Error("Scribe QC HTTP " + r.status);
const d = await r.json();
await writeFile(target, JSON.stringify(d, null, 2));
console.log(
  JSON.stringify({
    transcribed: true,
    words: d.words?.length,
    characters: d.text?.length,
  }),
);
