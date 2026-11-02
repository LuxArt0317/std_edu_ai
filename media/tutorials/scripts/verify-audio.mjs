import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve("artifacts/tutorials"),
  manifest = JSON.parse(await readFile(resolve(root, "assets/manifest.json"))),
  chapters = JSON.parse(await readFile(resolve(root, "exports/chapters.json")));
const rate = 16000;
function pcm(path) {
  const b = execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      path,
      "-vn",
      "-f",
      "s16le",
      "-ac",
      "1",
      "-ar",
      String(rate),
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return new Int16Array(b.buffer, b.byteOffset, b.length / 2);
}
const actual = pcm(resolve(root, "exports/00-complete-walkthrough.mp4")),
  rows = [];
for (const ep of manifest.episodes) {
  const chapter = chapters.chapters.find((x) => x.id === ep.id);
  for (const sc of ep.scenes) {
    const expected = pcm(resolve(root, "assets", sc.audio)),
      base = Math.round((chapter.start + sc.from / 30 + 0.5) * rate),
      start = Math.round(0.15 * rate),
      end = Math.min(
        expected.length - Math.round(0.15 * rate),
        Math.floor(sc.audioDuration * rate),
      );
    function score(lag, step = 32) {
      let xy = 0,
        xx = 0,
        yy = 0;
      for (let i = start; i < end; i += step) {
        const x = expected[i],
          y = actual[base + i + lag] || 0;
        xy += x * y;
        xx += x * x;
        yy += y * y;
      }
      return xy / Math.sqrt(xx * yy || 1);
    }
    let best = -1,
      lag = 0;
    for (let l = -1920; l <= 1920; l += 16) {
      const r = score(l);
      if (r > best) {
        best = r;
        lag = l;
      }
    }
    const coarse = lag;
    for (let l = coarse - 15; l <= coarse + 15; l++) {
      const r = score(l, 16);
      if (r > best) {
        best = r;
        lag = l;
      }
    }
    assert.ok(
      best > 0.9,
      `${sc.id}: export narration differs from source (${best.toFixed(4)})`,
    );
    assert.ok(
      Math.abs(lag / rate) < 0.12,
      `${sc.id}: narration timing shifted`,
    );
    rows.push({
      scene: sc.id,
      correlation: Number(best.toFixed(5)),
      offsetMs: Number(((lag / rate) * 1000).toFixed(2)),
      passed: true,
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
await mkdir(resolve(root, "qc"), { recursive: true });
await writeFile(
  resolve(root, "qc/audio-source-match.json"),
  JSON.stringify(
    {
      source: "Original ElevenLabs scene audio versus decoded delivered master",
      rate,
      scenes: rows.length,
      allPassed: true,
      rows,
    },
    null,
    2,
  ),
);
