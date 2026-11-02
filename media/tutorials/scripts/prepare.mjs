import { readFile, writeFile } from "node:fs/promises";
const content = JSON.parse(await readFile("media/tutorials/content.json")),
  audio = JSON.parse(await readFile("artifacts/tutorials/narration.json"));
let captures = {};
try {
  captures = JSON.parse(await readFile("artifacts/tutorials/captures.json"));
} catch {}
function words(a) {
  const list = [];
  let word = "",
    start = 0,
    end = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const c = a.characters[i];
    if (/\s/.test(c)) {
      if (word) {
        list.push({ text: word, start, end });
        word = "";
      }
    } else {
      if (!word) start = a.character_start_times_seconds[i];
      word += c;
      end = a.character_end_times_seconds[i];
    }
  }
  if (word) list.push({ text: word, start, end });
  return list;
}
function cues(ws) {
  const result = [];
  let group = [];
  for (const w of ws) {
    if (
      group.length &&
      (group.length >= 8 ||
        group.map((x) => x.text).join(" ").length + w.text.length > 67)
    ) {
      result.push({
        text: group.map((x) => x.text).join(" "),
        start: group[0].start + 0.5,
        end: group.at(-1).end + 0.62,
      });
      group = [];
    }
    group.push(w);
    if (/[.!?]$/.test(w.text) && group.length >= 4) {
      result.push({
        text: group.map((x) => x.text).join(" "),
        start: group[0].start + 0.5,
        end: group.at(-1).end + 0.62,
      });
      group = [];
    }
  }
  if (group.length)
    result.push({
      text: group.map((x) => x.text).join(" "),
      start: group[0].start + 0.5,
      end: group.at(-1).end + 0.62,
    });
  for (let i = 0; i < result.length - 1; i++)
    result[i].end = Math.min(result[i].end, result[i + 1].start - 0.015);
  return result;
}
const episodes = content.episodes.map((ep, index) => {
  let frame = 0;
  const scenes = ep.scenes.map((sc) => {
    const a = audio.find((x) => x.id === sc.id);
    if (!a) throw Error("Missing narration: " + sc.id);
    const capture = captures[sc.id] || { duration: 10, complete: false };
    if (
      sc.kind !== "graphic" &&
      !capture.complete &&
      !process.argv.includes("--allow-incomplete")
    )
      throw Error("Missing live footage: " + sc.id);
    const frames = Math.ceil((a.duration + 1) * 30),
      ws = words(a.alignment),
      out = {
        ...sc,
        from: frame,
        frames,
        audio: a.audio,
        audioDuration: a.duration,
        words: ws,
        captions: cues(ws),
        capture: { duration: capture.duration, role: sc.role },
      };
    frame += frames;
    return out;
  });
  return { ...ep, number: index + 1, frames: frame, scenes };
});
await writeFile(
  "artifacts/tutorials/assets/manifest.json",
  JSON.stringify({ episodes }, null, 2),
);
console.log(
  JSON.stringify({
    episodes: episodes.map((x) => ({ id: x.id, seconds: x.frames / 30 })),
    seconds: episodes.reduce((n, x) => n + x.frames / 30, 0),
  }),
);
