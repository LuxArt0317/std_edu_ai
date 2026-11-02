import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  content = JSON.parse(
    await readFile(resolve(root, "media/tutorials/content.json"), "utf8"),
  ),
  env = parseEnv(
    await readFile(resolve(root, ".env.elevenlabs.local"), "utf8"),
  );
if (!env.ELEVENLABS_API_KEY)
  throw Error("Missing private ElevenLabs credential");
const dir = resolve(root, "artifacts/tutorials/assets/audio");
await mkdir(dir, { recursive: true });
const voice = "XrExE9yKIg1WjnnlVkGX",
  model = "eleven_multilingual_v2";
const records = [];
for (const episode of content.episodes)
  for (const scene of episode.scenes) {
    const spec = {
        text: scene.narration,
        model_id: model,
        voice_settings: {
          stability: 0.56,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
          speed: 1.0,
        },
      },
      hash = createHash("sha256")
        .update(JSON.stringify({ voice, spec }))
        .digest("hex");
    const jsonPath = resolve(dir, scene.id + ".json"),
      mp3 = resolve(dir, scene.id + ".mp3");
    let item;
    try {
      const saved = JSON.parse(await readFile(jsonPath, "utf8"));
      if (saved.hash === hash) {
        await readFile(mp3);
        item = saved;
      }
    } catch {}
    if (!item) {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(spec),
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!r.ok) throw Error(`ElevenLabs ${scene.id}: HTTP ${r.status}`);
      const body = await r.json();
      if (!body.audio_base64 || !body.alignment?.characters)
        throw Error("Invalid speech/alignment response");
      await writeFile(mp3 + ".tmp", Buffer.from(body.audio_base64, "base64"));
      await rename(mp3 + ".tmp", mp3);
      item = {
        hash,
        voice,
        model,
        text: scene.narration,
        alignment: body.normalized_alignment || body.alignment,
        generatedAt: new Date().toISOString(),
        requestId: r.headers.get("request-id"),
      };
      await writeFile(jsonPath, JSON.stringify(item, null, 2));
    }
    const duration = Number(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=nw=1:nk=1",
          mp3,
        ],
        { encoding: "utf8" },
      ).trim(),
    );
    records.push({
      episode: episode.id,
      id: scene.id,
      audio: `audio/${scene.id}.mp3`,
      duration,
      alignment: item.alignment,
    });
    await writeFile(
      resolve(root, "artifacts/tutorials/narration.json"),
      JSON.stringify(records, null, 2),
    );
    console.log(
      JSON.stringify({
        scene: scene.id,
        duration,
        characters: scene.narration.length,
        cached: Boolean(item.generatedAt),
      }),
    );
  }
console.log(
  JSON.stringify({
    done: true,
    scenes: records.length,
    seconds: records.reduce((n, x) => n + x.duration, 0),
  }),
);
