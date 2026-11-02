import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { downloadSchoolAsset } from "./lib/download-school-asset.mjs";
const root = path.resolve("public/school-assets"),
  cache = path.resolve("node_modules/.cache/stu-school-assets");
const manifest = JSON.parse(
  await fs.readFile("src/features/public/mirror/assets.json", "utf8"),
);
const unique = [
  ...new Map(
    manifest
      .filter((a) => /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/.test(a.file))
      .map((a) => [a.file, a]),
  ).values(),
];
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
await fs.mkdir(root, { recursive: true });
await fs.mkdir(cache, { recursive: true });
let cursor = 0,
  verified = 0,
  downloaded = 0,
  restored = 0;
const failures = [];
async function matches(file, checksum) {
  try {
    return sha(await fs.readFile(file)) === checksum;
  } catch {
    return false;
  }
}
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < unique.length) {
      const asset = unique[cursor++],
        name = path.basename(asset.file);
      if (
        !/^[a-f\d]{20}\.[a-z\d]+$/.test(name) ||
        asset.file !== "/school-assets/" + name ||
        !/^[a-f\d]{64}$/.test(asset.checksum)
      ) {
        failures.push({ file: asset.file, reason: "Invalid asset manifest" });
        continue;
      }
      const target = path.join(root, name),
        saved = path.join(cache, name);
      if (await matches(target, asset.checksum)) {
        verified++;
        continue;
      }
      if (await matches(saved, asset.checksum)) {
        await fs.copyFile(saved, target);
        restored++;
        continue;
      }
      if (
        process.argv.includes("--check") ||
        process.env.STU_MIRROR_OFFLINE === "1"
      ) {
        failures.push({
          file: asset.file,
          reason: "Verified local asset missing",
        });
        continue;
      }
      try {
        let buffer, last;
        for (let attempt = 0; attempt < 2; attempt++)
          try {
            const r = await downloadSchoolAsset(asset.source, {
              timeout: 180000,
              maxBytes: 100_000_000,
            });
            if (sha(r.buffer) !== asset.checksum)
              throw Error(
                "Source checksum changed; recapture and review before release",
              );
            buffer = r.buffer;
            break;
          } catch (e) {
            last = e;
          }
        if (!buffer) throw last;
        const temp = target + ".partial";
        await fs.writeFile(temp, buffer);
        await fs.rename(temp, target);
        await fs.copyFile(target, saved);
        downloaded++;
      } catch (e) {
        failures.push({ file: asset.file, reason: e.message });
      }
      if ((verified + restored + downloaded + failures.length) % 100 === 0)
        console.log(
          JSON.stringify({
            verified,
            restored,
            downloaded,
            failed: failures.length,
            total: unique.length,
          }),
        );
    }
  }),
);
console.log(
  JSON.stringify({
    verified,
    restored,
    downloaded,
    total: unique.length,
    failures,
  }),
);
if (failures.length) process.exitCode = 1;
