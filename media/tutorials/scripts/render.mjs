import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(
  await readFile(resolve(root, "artifacts/tutorials/assets/manifest.json")),
);
const output = resolve(root, "artifacts/tutorials/exports"),
  work = resolve(root, "artifacts/tutorials/rendered-scenes");
await mkdir(output, { recursive: true });
await mkdir(work, { recursive: true });
const browserExecutable =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const serveUrl = await bundle({
  entryPoint: resolve(root, "media/tutorials/src/index.tsx"),
  publicDir: resolve(root, "artifacts/tutorials/assets"),
  outDir: resolve(root, "artifacts/tutorials/bundle"),
});
const compositions = await getCompositions(serveUrl, {
  inputProps: manifest,
  browserExecutable,
  timeoutInMilliseconds: 120000,
});
function probe(path) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ),
  );
}
function valid(path, frames, audio = false) {
  try {
    const p = probe(path),
      v = p.streams.find((x) => x.codec_type === "video");
    return (
      v?.width === 1920 &&
      v.height === 1080 &&
      Number(v.nb_frames) === frames &&
      (!audio || p.streams.some((x) => x.codec_type === "audio"))
    );
  } catch {
    return false;
  }
}
const ff = (args) =>
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: "pipe" },
  );
const quote = (p) => `file '${p.replaceAll("'", "'\\''")}'`;
for (const c of compositions) {
  const ep = manifest.episodes.find((x) => x.id === c.id);
  if (process.env.EPISODE && c.id !== process.env.EPISODE) continue;
  if (process.argv.includes("--stills")) {
    for (const scene of ep.scenes)
      await renderStill({
        serveUrl,
        composition: c,
        inputProps: manifest,
        browserExecutable,
        frame: scene.from + Math.min(90, scene.frames - 1),
        output: resolve(output, `${scene.id}.png`),
        timeoutInMilliseconds: 120000,
      });
    continue;
  }
  await mkdir(resolve(work, "chapters"), { recursive: true });
  const dest = resolve(work, "chapters", ep.slug + "-raw.mp4");
  if (valid(dest, ep.frames, true) && !process.argv.includes("--force")) {
    console.log(JSON.stringify({ episode: c.id, cached: true }));
    continue;
  }
  const videos = [],
    audios = [];
  for (const scene of ep.scenes) {
    const video = resolve(work, scene.id + ".mp4"),
      wav = resolve(work, scene.id + ".wav");
    if (!valid(video, scene.frames) || process.argv.includes("--force")) {
      console.log(
        JSON.stringify({
          scene: scene.id,
          status: "rendering",
          frames: scene.frames,
        }),
      );
      let last = 0;
      await renderMedia({
        serveUrl,
        composition: c,
        inputProps: manifest,
        frameRange: [scene.from, scene.from + scene.frames - 1],
        codec: "h264",
        muted: true,
        crf: 19,
        x264Preset: "fast",
        outputLocation: video,
        browserExecutable,
        concurrency: 6,
        offthreadVideoCacheSizeInBytes: 268435456,
        imageFormat: "jpeg",
        jpegQuality: 90,
        timeoutInMilliseconds: 120000,
        onProgress: ({ progress }) => {
          const percent = Math.floor(progress * 100);
          if (percent >= last + 25) {
            last = percent;
            console.log(JSON.stringify({ scene: scene.id, percent }));
          }
        },
      });
      if (!valid(video, scene.frames))
        throw Error("Invalid rendered scene " + scene.id);
    }
    ff([
      "-i",
      resolve(root, "artifacts/tutorials/assets", scene.audio),
      "-af",
      `aresample=48000,adelay=500:all=1,apad,atrim=end_sample=${scene.frames * 1600},asetpts=N/SR/TB`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
    videos.push(video);
    audios.push(wav);
    console.log(JSON.stringify({ scene: scene.id, status: "ready" }));
  }
  const vl = resolve(work, ep.slug + "-video.txt"),
    al = resolve(work, ep.slug + "-audio.txt");
  await writeFile(vl, videos.map(quote).join("\n") + "\n");
  await writeFile(al, audios.map(quote).join("\n") + "\n");
  const joined = resolve(work, ep.slug + "-narration.wav");
  ff(["-f", "concat", "-safe", "0", "-i", al, "-c:a", "pcm_s16le", joined]);
  ff([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    vl,
    "-i",
    joined,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    dest,
  ]);
  if (!valid(dest, ep.frames, true))
    throw Error("Invalid assembled chapter " + ep.id);
  console.log(
    JSON.stringify({ episode: c.id, status: "rendered", path: dest }),
  );
}
