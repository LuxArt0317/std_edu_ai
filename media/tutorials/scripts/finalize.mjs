import { readFile, writeFile, stat, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const manifest = JSON.parse(
    await readFile("artifacts/tutorials/assets/manifest.json"),
  ),
  out = resolve("artifacts/tutorials/exports"),
  work = resolve("artifacts/tutorials/rendered-scenes/chapters");
await mkdir(work, { recursive: true });
await mkdir(out, { recursive: true });
const ff = (args) =>
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: "pipe" },
  );
function tc(sec, sep = ",") {
  const ms = Math.round(sec * 1000);
  return (
    [
      Math.floor(ms / 3600000),
      Math.floor(ms / 60000) % 60,
      Math.floor(ms / 1000) % 60,
    ]
      .map((x) => String(x).padStart(2, "0"))
      .join(":") +
    sep +
    String(ms % 1000).padStart(3, "0")
  );
}
const list = (paths) =>
  paths.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join("\n") + "\n";
const chapterRows = [],
  allCues = [],
  wavs = [];
let total = 0;
for (const ep of manifest.episodes) {
  const input = resolve(work, ep.slug + "-raw.mp4"),
    dest = resolve(out, ep.slug + ".mp4"),
    wav = resolve(work, ep.slug + "-normalized.wav"),
    stamp = resolve(work, ep.slug + "-delivery-v2.json");
  try {
    await stat(input);
  } catch {
    try {
      await rename(resolve(out, ep.slug + "-raw.mp4"), input);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  let inputStat;
  try {
    inputStat = await stat(input);
  } catch (e) {
    if (process.argv.includes("--partial")) continue;
    throw e;
  }
  const version = {
    pipeline: 2,
    sourceMtime: inputStat.mtimeMs,
    frames: ep.frames,
  };
  let cached = false;
  try {
    cached =
      JSON.stringify(JSON.parse(await readFile(stamp))) ===
      JSON.stringify(version);
    await stat(dest);
    await stat(wav);
  } catch {
    cached = false;
  }
  if (!cached || process.argv.includes("--force")) {
    ff([
      "-i",
      input,
      "-vn",
      "-af",
      `loudnorm=I=-16:TP=-2:LRA=11,aresample=48000,apad,atrim=end_sample=${ep.frames * 1600},asetpts=N/SR/TB`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
    ff([
      "-i",
      input,
      "-i",
      wav,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-vf",
      "scale=in_range=auto:out_range=tv,format=yuv420p",
      "-c:v",
      "libx264",
      "-threads",
      "4",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-color_range",
      "tv",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-t",
      String(ep.frames / 30),
      "-movflags",
      "+faststart",
      "-metadata",
      "title=" + ep.title,
      dest,
    ]);
    await writeFile(stamp, JSON.stringify(version));
  }
  const cues = ep.scenes.flatMap((sc) =>
    sc.captions.map((c) => ({
      ...c,
      start: c.start + sc.from / 30,
      end: c.end + sc.from / 30,
    })),
  );
  await writeFile(
    resolve(out, ep.slug + ".srt"),
    cues
      .map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text}\n`)
      .join("\n"),
  );
  await writeFile(
    resolve(out, ep.slug + ".vtt"),
    "WEBVTT\n\n" +
      cues
        .map((c) => `${tc(c.start, ".")} --> ${tc(c.end, ".")}\n${c.text}\n`)
        .join("\n"),
  );
  const duration = ep.frames / 30;
  chapterRows.push({
    id: ep.id,
    title: ep.title,
    audience: ep.audience,
    roles: ep.roles,
    start: total,
    duration,
    file: ep.slug + ".mp4",
  });
  allCues.push(
    ...cues.map((c) => ({ ...c, start: c.start + total, end: c.end + total })),
  );
  wavs.push(wav);
  total += duration;
  console.log(
    JSON.stringify({
      episode: ep.id,
      seconds: duration,
      normalized: true,
      standardPixelFormat: true,
    }),
  );
}
if (chapterRows.length < manifest.episodes.length) {
  console.log(JSON.stringify({ partial: true, available: chapterRows.length }));
  process.exit(0);
}
const vl = resolve(work, "concat.txt"),
  al = resolve(work, "audio-concat.txt"),
  meta = resolve(work, "chapters.ffmeta");
await writeFile(vl, list(chapterRows.map((x) => resolve(out, x.file))));
await writeFile(al, list(wavs));
await writeFile(
  meta,
  ";FFMETADATA1\n" +
    chapterRows
      .map(
        (x) =>
          `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(x.start * 1000)}\nEND=${Math.round((x.start + x.duration) * 1000)}\ntitle=${x.title}\n`,
      )
      .join(""),
);
// Decode each PCM chapter independently, then encode one AAC track. Packet-copying
// separately encoded AAC chapters loses encoder padding and shifts later speech.
ff([
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  vl,
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  al,
  "-i",
  meta,
  "-map",
  "0:v:0",
  "-map",
  "1:a:0",
  "-map_metadata",
  "2",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-t",
  String(total),
  "-movflags",
  "+faststart",
  resolve(out, "00-complete-walkthrough.mp4"),
]);
await writeFile(
  resolve(out, "00-complete-walkthrough.srt"),
  allCues
    .map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text}\n`)
    .join("\n"),
);
await writeFile(
  resolve(out, "00-complete-walkthrough.vtt"),
  "WEBVTT\n\n" +
    allCues
      .map((c) => `${tc(c.start, ".")} --> ${tc(c.end, ".")}\n${c.text}\n`)
      .join("\n"),
);
await writeFile(
  resolve(out, "chapters.json"),
  JSON.stringify({ seconds: total, chapters: chapterRows }, null, 2),
);
await writeFile(
  resolve(out, "CHAPTERS.txt"),
  chapterRows
    .map((x) => `${tc(x.start, ".").slice(0, 8)}  ${x.title} — ${x.audience}`)
    .join("\n") + "\n",
);
console.log(
  JSON.stringify({
    master: "00-complete-walkthrough.mp4",
    seconds: total,
    episodes: chapterRows.length,
    continuousAudio: true,
  }),
);
