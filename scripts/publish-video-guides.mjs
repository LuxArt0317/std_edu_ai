import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deploymentEnvironment } from "./deployment-env.mjs";
const cataloguePath = "src/features/school/portal/video-guide-catalog.json",
  directory = "artifacts/tutorials/exports";
const hash = (b) => createHash("sha256").update(b).digest("hex");
if (process.argv.includes("--prepare")) {
  const content = JSON.parse(await readFile("media/tutorials/content.json")),
    chapters = JSON.parse(await readFile(directory + "/chapters.json"));
  const rows = [
    {
      id: "complete",
      title: "Complete walkthrough",
      audience: "All roles",
      roles: ["all"],
      duration: chapters.seconds,
      slug: "00-complete-walkthrough",
      scenes: content.episodes.flatMap((e) => e.scenes),
    },
    ...content.episodes.map((e) => ({
      ...e,
      duration: chapters.chapters.find((c) => c.id === e.id).duration,
    })),
  ];
  const guides = [];
  for (const row of rows) {
    const assets = {};
    for (const [format, mime] of Object.entries({
      mp4: "video/mp4",
      vtt: "text/vtt",
      srt: "application/x-subrip",
    })) {
      const filename = row.slug + "." + format,
        buffer = await readFile(directory + "/" + filename),
        digest = hash(buffer);
      assets[format] = {
        filename,
        path: `v1/${digest.slice(0, 16)}/${filename}`,
        sha256: digest,
        bytes: buffer.length,
        mime,
      };
    }
    guides.push({
      id: row.id,
      title: row.title,
      audience: row.audience,
      roles: row.roles,
      duration: row.duration,
      assets,
      transcript: row.scenes.map((s) => ({
        title: s.title,
        text: s.narration,
      })),
    });
  }
  await writeFile(
    cataloguePath,
    JSON.stringify(
      { bucket: "tutorial-guides", version: "2026-11-02", guides },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      prepared: true,
      guides: guides.length,
      assets: guides.length * 3,
    }),
  );
  process.exit(0);
}
if (!process.argv.includes("--apply"))
  throw Error(
    "Use --prepare for metadata or --apply to publish verified media.",
  );
const config = JSON.parse(await readFile("deployment.json")),
  env = deploymentEnvironment(),
  url = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
if (new URL(url).hostname !== config.supabase.projectRef + ".supabase.co")
  throw Error("Wrong client target");
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  catalogue = JSON.parse(await readFile(cataloguePath));
const { data: bucket, error: bucketError } = await client.storage.getBucket(
  catalogue.bucket,
);
if (bucketError || !bucket || bucket.public)
  throw Error("Apply the private tutorial bucket migration first");
const published = [];
for (const guide of catalogue.guides)
  for (const asset of Object.values(guide.assets)) {
    const buffer = await readFile(directory + "/" + asset.filename);
    if (hash(buffer) !== asset.sha256)
      throw Error("Source media differs from catalogue: " + asset.filename);
    let response = await client.storage
      .from(catalogue.bucket)
      .upload(asset.path, buffer, {
        contentType: asset.mime,
        cacheControl: "31536000",
        upsert: false,
      });
    if (
      response.error &&
      !["409", "400"].includes(String(response.error.statusCode))
    )
      throw Error(
        "Video upload failed: " + asset.filename + " " + response.error.message,
      );
    const result = await client.storage
      .from(catalogue.bucket)
      .download(asset.path);
    if (result.error || !result.data)
      throw Error("Cannot verify stored object: " + asset.filename);
    const stored = Buffer.from(await result.data.arrayBuffer());
    if (hash(stored) !== asset.sha256)
      throw Error("Stored object digest mismatch: " + asset.filename);
    published.push({
      path: asset.path,
      sha256: asset.sha256,
      bytes: asset.bytes,
    });
    console.log(
      JSON.stringify({
        file: asset.filename,
        verified: true,
        bytes: asset.bytes,
      }),
    );
  }
await mkdir("artifacts/guides", { recursive: true });
await writeFile(
  "artifacts/guides/publication.json",
  JSON.stringify(
    {
      project: config.supabase.projectRef,
      bucket: catalogue.bucket,
      private: true,
      objects: published,
      publishedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
