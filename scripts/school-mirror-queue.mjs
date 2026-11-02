import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalSchoolUrl } from "../src/features/public/mirror/paths.ts";
const root = "artifacts/site-mirror",
  dir = root + "/captures";
let old = { byKey: {}, records: {} };
try {
  old = JSON.parse(await fs.readFile(root + "/queue.json", "utf8"));
} catch {}
const roots = new Set(),
  edges = new Map();
const byKey = old.byKey || {},
  records = old.records || {},
  filePattern =
    /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|png|jpe?g|gif|webp|svg|mp4|mp3)(?:$|\?)/i;
const protectedHost =
  /^(?:sso2?|tcidentity|tc|edi3|vpn2?|dorm|dtm|elearning|infosys|go|info|my|office365)\.stu\.edu\.tw$/i;
const risky =
  /\/(?:logout|logoff|delete|remove|cancel|submit|wp-admin|wp-login\.php)(?:[/.?]|$)|[?&](?:action|op|cmd)=(?:delete|remove|logout|update|submit)/i;
for (const file of await fs.readdir(dir))
  if (file.endsWith(".json") && !file.endsWith(".assets.json")) {
    const snapshot = JSON.parse(
      await fs.readFile(path.join(dir, file), "utf8"),
    );
    const own = canonicalSchoolUrl(snapshot.url);
    if (!/^[a-f0-9]{16}\.json$/.test(file) && own) roots.add(own);
    if (own)
      edges.set(
        own,
        (snapshot.links || [])
          .map((l) => canonicalSchoolUrl(l.url, snapshot.url))
          .filter(Boolean),
      );
    if (own)
      records[own] = {
        ...(records[own] || {}),
        url: own,
        actual: own,
        status: snapshot.html?.includes("[Truncated]")
          ? "truncated"
          : "captured",
        key: path.basename(file, ".json"),
        depth: records[own]?.depth || 0,
        title: snapshot.title,
      };
    const requested=byKey[path.basename(file,'.json')]?.url;
    if(requested&&own)records[requested]={...(records[requested]||{}),url:requested,status:'captured',actual:own,title:snapshot.title,key:path.basename(file,'.json')};
    for (const link of snapshot.links || []) {
      const url = canonicalSchoolUrl(link.url, snapshot.url);
      if (!url) continue;
      const key = createHash("sha256").update(url).digest("hex").slice(0, 16);
      const observed = new URL(link.observedUrl||link.url, snapshot.url),
        fetchUrl =
          observed.protocol === "http:" ? url.replace(/^https:/, "http:") : url;
      if (records[url]) {
        if (!records[url].fetchUrl || observed.protocol === "http:")
          records[url].fetchUrl = fetchUrl;
        continue;
      }
      const u = new URL(url),
        status = risky.test(url)
          ? "excluded-action"
          : u.hostname === "info.stu.edu.tw" && /^\/ePortal\//i.test(u.pathname)
            ? "local-ui-preview"
            : protectedHost.test(u.hostname)
              ? "requires-auth-integration"
              : filePattern.test(url)
                ? "document-pending"
                : "pending";
      records[url] = {
        url,
        fetchUrl,
        key,
        title: link.text || decodeURI(u.pathname),
        status,
        depth: (records[own]?.depth || 0) + 1,
        from: own,
      };
      byKey[key] = { url, from: own };
    }
  }
const distances = new Map([...roots].map((u) => [u, 0]));
let todo = [...roots];
while (todo.length) {
  const u = todo.shift(),
    d = distances.get(u);
  for (const v of edges.get(u) || [])
    if (!distances.has(v) || distances.get(v) > d + 1) {
      distances.set(v, d + 1);
      todo.push(v);
    }
  for (const r of Object.values(records)) {
    const actual = canonicalSchoolUrl(r.actual || "");
    if (actual && (r.url === u || actual === u)) {
      const v = r.url === u ? actual : r.url;
      if (!distances.has(v) || distances.get(v) > d) {
        distances.set(v, d);
        todo.push(v);
      }
    }
  }
}
for (const r of Object.values(records)) r.depth = distances.get(r.url) ?? 1000;
for (const r of Object.values(records))
  if (r.status === "pending" && protectedHost.test(new URL(r.url).hostname))
    r.status = "requires-auth-integration";
const all = Object.values(records),
  priority = (r) =>
    r.url.includes("reg.aca")
      ? 0
      : r.url.includes("freshman")
        ? 1
        : r.url.includes("www.stu.edu.tw")
          ? 2
          : r.url.includes("oica")
            ? 3
            : 4;
const pending = all
  .filter((r) => r.status === "pending")
  .sort(
    (a, b) =>
      a.depth - b.depth ||
      priority(a) - priority(b) ||
      a.url.localeCompare(b.url),
  );
await fs.writeFile(
  root + "/queue.json",
  JSON.stringify({ byKey, records }, null, 2),
);
await fs.writeFile(root + "/pending.json", JSON.stringify(pending, null, 2));
console.log(
  JSON.stringify({
    total: all.length,
    counts: all.reduce(
      (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
      {},
    ),
    pendingByHost: pending.reduce(
      (a, r) => (
        (a[new URL(r.url).hostname] = (a[new URL(r.url).hostname] || 0) + 1),
        a
      ),
      {},
    ),
  }),
);
