import assert from "node:assert/strict";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const manifest = JSON.parse(
  await readFile("artifacts/tutorials/assets/manifest.json"),
);
const captures = JSON.parse(
  await readFile("artifacts/tutorials/captures.json"),
);
const roleProof = JSON.parse(
  await readFile("artifacts/tutorials/roles-verified.json"),
);
const chapterData = JSON.parse(
  await readFile("artifacts/tutorials/exports/chapters.json"),
);
const expectedRoles = [
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
  "registrar",
  "department_head",
  "faculty",
  "advisor",
  "admissions",
  "finance",
  "support",
  "librarian",
  "student",
];
assert.deepEqual(
  roleProof.roles.map((x) => x.role).sort(),
  expectedRoles.sort(),
);
assert.ok(
  roleProof.allAuthenticated &&
    roleProof.roles.every((x) => x.verified && x.captured),
);
const sceneIds = new Set();
let captions = 0;
for (const ep of manifest.episodes) {
  let next = 0;
  for (const sc of ep.scenes) {
    assert.ok(!sceneIds.has(sc.id), "Duplicate scene");
    sceneIds.add(sc.id);
    assert.equal(sc.from, next);
    next += sc.frames;
    assert.ok(sc.audioDuration + 0.5 < sc.frames / 30);
    let previous = 0;
    for (const c of sc.captions) {
      assert.ok(c.text.trim() && !c.text.includes("\\n"));
      assert.ok(
        c.start >= previous && c.end > c.start && c.end <= sc.frames / 30,
      );
      previous = c.end;
      captions++;
    }
    if (sc.kind !== "graphic") {
      assert.ok(captures[sc.id].complete && captures[sc.id].synthetic);
      assert.equal(captures[sc.id].appErrors.length, 0);
      await stat(`artifacts/tutorials/assets/footage/${sc.id}.mp4`);
    }
  }
  assert.equal(next, ep.frames);
}
const out = resolve("artifacts/tutorials/exports"),
  rows = [];
for (const file of [
  "00-complete-walkthrough.mp4",
  ...chapterData.chapters.map((x) => x.file),
]) {
  const path = resolve(out, file),
    p = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
        { encoding: "utf8" },
      ),
    );
  const v = p.streams.find((x) => x.codec_type === "video"),
    a = p.streams.find((x) => x.codec_type === "audio");
  assert.equal(v.codec_name, "h264");
  assert.equal(v.width, 1920);
  assert.equal(v.height, 1080);
  assert.equal(v.pix_fmt, "yuv420p");
  assert.equal(v.r_frame_rate, "30/1");
  assert.equal(a.codec_name, "aac");
  assert.equal(a.sample_rate, "48000");
  assert.equal(a.channels, 2);
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-v", "error", "-i", path, "-f", "null", "-"],
    { stdio: "pipe" },
  );
  const source = await readFile(path.replace(".mp4", ".srt"), "utf8");
  assert.ok(source.includes("-->"));
  assert.ok(!source.includes("undefined"));
  const duration = Number(p.format.duration);
  if (file !== "00-complete-walkthrough.mp4") {
    const ep = manifest.episodes.find((e) => e.slug + ".mp4" === file);
    assert.equal(Number(v.nb_frames), ep.frames);
    assert.ok(Math.abs(duration - ep.frames / 30) < 0.15);
  }
  rows.push({
    file,
    seconds: duration,
    frames: Number(v.nb_frames),
    decode: "passed",
    video: "1920x1080 H264 yuv420p 30fps",
    audio: "stereo AAC 48kHz",
  });
  console.log(JSON.stringify(rows.at(-1)));
}
const keyMode = (await stat(".env.elevenlabs.local")).mode & 0o777;
assert.equal(keyMode, 0o600);
execFileSync("git", ["check-ignore", "--quiet", ".env.elevenlabs.local"]);
let privateStatePresent = true;
try {
  await stat("artifacts/tutorials/private-state.json");
} catch (e) {
  if (e.code === "ENOENT") privateStatePresent = false;
  else throw e;
}
assert.equal(privateStatePresent, false, "Run isolated fixture cleanup");
const cleanup = JSON.parse(await readFile("artifacts/tutorials/cleanup.json"));
assert.ok(
  cleanup.fixtureRecordsRemoved &&
    cleanup.secretsRemoved &&
    cleanup.removedAccounts === 13,
);
await mkdir("artifacts/tutorials/qc", { recursive: true });
await writeFile(
  "artifacts/tutorials/qc/verification.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      chapters: manifest.episodes.length,
      scenes: sceneIds.size,
      captions,
      authenticatedRoles: 14,
      decode: rows,
      credentialPrivate: true,
      fixtureCleanup: cleanup,
      editorialDecision:
        "Not fully verifiable: uninterrupted human playback and listening acceptance remains",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    passed: true,
    chapters: manifest.episodes.length,
    scenes: sceneIds.size,
    roles: 14,
    captions,
  }),
);
