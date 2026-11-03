import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  downloadSchoolAsset,
  safeSchoolAssetUrl,
  schoolAssetIdentity,
} from "./lib/download-school-asset.mjs";
import {
  canonicalSchoolUrl,
  localSchoolHref,
} from "../src/features/public/mirror/paths.ts";
const captureDir = path.resolve("artifacts/site-mirror/captures"),
  assetDir = "public/school-assets",
  pageDir = "public/school-pages";
await fs.mkdir(assetDir, { recursive: true });
await fs.mkdir(pageDir, { recursive: true });
async function writeChanged(file, data) {
  const next = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try {
    const old = await fs.readFile(file);
    if (old.equals(next)) return;
  } catch {}
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, next);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
const hash = (value) => createHash("sha256").update(value).digest("hex"),
  assets = new Map(),
  pathAssets = new Map(),
  failures = [],
  pages = [];
const files = (await fs.readdir(captureDir)).filter(
  (f) => f.endsWith(".json") && !f.endsWith(".assets.json"),
);
const safeAssetUrl = safeSchoolAssetUrl;
function assetKey(value, base) {
  try {
    const u = new URL(value, base);
    u.hash = "";
    return u.href;
  } catch {
    return "";
  }
}
function typeExtension(type, url) {
  const mime = (type || "").split(";")[0];
  return (
    {
      "text/css": ".css",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/svg+xml": ".svg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/avif": ".avif",
      "image/x-icon": ".ico",
      "font/woff2": ".woff2",
      "font/woff": ".woff",
      "font/ttf": ".ttf",
      "application/pdf": ".pdf",
    }[mime] ||
    path
      .extname(new URL(url).pathname)
      .toLowerCase()
      .match(
        /^\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|pdf|docx?|xlsx?|pptx?|zip|rar|mp4|mp3)$/,
      )?.[0] ||
    ".bin"
  );
}
async function addAsset(url, buffer, type) {
  const key = assetKey(url);
  if (!key || assets.has(key)) return assets.get(key);
  const ext = typeExtension(type, url);
  if (
    buffer.length >
    (/^\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/.test(ext)
      ? 100_000_000
      : 25 * 1024 * 1024)
  ) {
    failures.push({ url, reason: "Asset exceeds import size limit" });
    return null;
  }
  const css = ext === ".css",
    name = (css ? hash(key) : hash(buffer)).slice(0, 20) + ext;
  if (ext === ".bin") {
    failures.push({ url, reason: "Unsupported public asset type", type });
    return null;
  }
  const asset = {
    url: key,
    file: "/school-assets/" + name,
    type,
    buffer: css ? buffer : null,
    css,
    sourceChecksum: hash(buffer),
    bytes: buffer.length,
  };
  assets.set(key, asset);
  pathAssets.set(schoolAssetIdentity(key), asset);
  if (!css) await writeChanged("public" + asset.file, buffer);
  return asset;
}
for (const f of await fs.readdir(captureDir))
  if (f.endsWith(".assets.json")) {
    const bundle = JSON.parse(
      await fs.readFile(path.join(captureDir, f), "utf8"),
    );
    for (const item of bundle.assets || []) {
      if (!safeAssetUrl(item.url)) continue;
      try {
        await addAsset(
          item.url,
          await fs.readFile(item.path),
          item.contentType,
        );
      } catch {
        failures.push({ url: item.url, reason: "Captured file unavailable" });
      }
    }
    for (const item of bundle.failures || [])
      failures.push({ url: item.url, reason: item.reason });
  }
const resolveAsset = (value, base) => {
  if (!value || /^(data:|#)/i.test(value)) return value;
  const key = assetKey(value, base);
  return (
    (assets.get(key) || pathAssets.get(schoolAssetIdentity(key)))?.file || null
  );
};
const networkCache = "artifacts/site-mirror/network-assets.jsonl";
try {
  for (const line of (await fs.readFile(networkCache, "utf8"))
    .trim()
    .split("\n")) {
    if (!line) continue;
    const a = JSON.parse(line);
    await addAsset(a.url, await fs.readFile(a.path), a.type);
  }
} catch {
  /* First import has no network asset cache. */
}
const missing = new Set();
let queue = { records: {} };
try {
  queue = JSON.parse(
    await fs.readFile("artifacts/site-mirror/queue.json", "utf8"),
  );
} catch {}
for (const r of Object.values(queue.records))
  if (
    r.status === "document-pending" &&
    safeAssetUrl(r.url) &&
    !resolveAsset(r.url)
  )
    missing.add(r.url);
const failureCache = "artifacts/site-mirror/network-failures.json";
let priorFailures = {};
try {
  priorFailures = JSON.parse(await fs.readFile(failureCache, "utf8"));
} catch {}
for (const f of files) {
  const snapshot = JSON.parse(
    await fs.readFile(path.join(captureDir, f), "utf8"),
  );
  const $ = load(snapshot.html || "");
  $("img,source,video,audio,link[rel=stylesheet]").each((_, e) => {
    for (const name of ["src", "poster", "data-src", "data-lazy-src", "href"]) {
      const value = $(e).attr(name);
      if (
        !value ||
        /^(data:|#)/i.test(value) ||
        resolveAsset(value, snapshot.url)
      )
        continue;
      const u = assetKey(value, snapshot.url);
      if (safeAssetUrl(u)) missing.add(u);
    }
  });
  $("img[srcset],img[data-srcset]").each((_, e) => {
    const raw = $(e).attr("data-srcset") || $(e).attr("srcset") || "";
    const candidates = raw
      .split(",")
      .map((v) => v.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)[wx]$/))
      .filter(Boolean)
      .sort((a, b) => Number(b[2]) - Number(a[2]));
    if (candidates.some((c) => resolveAsset(c[1], snapshot.url))) return;
    const candidate = candidates.find(
      (c) =>
        Number(c[2]) <= 1600 && !priorFailures[assetKey(c[1], snapshot.url)],
    );
    if (candidate) {
      const url = assetKey(candidate[1], snapshot.url);
      if (safeAssetUrl(url)) missing.add(url);
    }
  });
  $("style,[style]").each((_, e) => {
    const css = e.tagName === "style" ? $(e).text() : $(e).attr("style") || "";
    for (const m of css.matchAll(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g,
    )) {
      const value = (m[1] || m[2] || m[3] || "").trim();
      if (
        !value ||
        /^(data:|#)/i.test(value) ||
        resolveAsset(value, snapshot.url)
      )
        continue;
      const u = assetKey(value, snapshot.url);
      if (safeAssetUrl(u)) missing.add(u);
    }
  });
}

for (const asset of [...assets.values()].filter((a) => a.css)) {
  const css = asset.buffer.toString("utf8");
  for (const m of css.matchAll(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g,
  )) {
    const url = (m[1] || m[2] || m[3] || "").trim();
    if (!url || /^(data:|#)/i.test(url) || resolveAsset(url, asset.url))
      continue;
    const absolute = assetKey(url, asset.url);
    if (safeAssetUrl(absolute)) missing.add(absolute);
  }
}
// Only discovered static assets are fetched. No website proxy, cookies or school credentials.
const missingList = process.argv.includes("--offline")
  ? []
  : [...missing].filter(
      (u) =>
        process.argv.includes("--retry-failed") ||
        !priorFailures[u] ||
        (/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)(?:$|\?)/i.test(u) &&
          /exceeds/i.test(priorFailures[u])),
    );
console.log(
  JSON.stringify({
    capturedPages: files.length,
    cachedAssets: assets.size,
    staticAssetFetches: missingList.length,
  }),
);
let cursor = 0,
  finished = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < missingList.length) {
      const url = missingList[cursor++];
      try {
        const { buffer, type } = await downloadSchoolAsset(url, {
          timeout: /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)(?:$|\?)/i.test(url)
            ? 180000
            : 6000,
          maxBytes: /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)(?:$|\?)/i.test(url)
            ? 100_000_000
            : 25 * 1024 * 1024,
        });
        const a = await addAsset(url, buffer, type);
        if (a) {
          const cache =
            "artifacts/site-mirror/network-" +
            hash(url).slice(0, 20) +
            path.extname(a.file);
          await fs.writeFile(cache, buffer);
          await fs.appendFile(
            networkCache,
            JSON.stringify({ url, path: cache, type }) + "\n",
          );
          delete priorFailures[url];
        }
      } catch (e) {
        priorFailures[url] = String(e.message);
        failures.push({ url, reason: String(e.message) });
      } finally {
        finished++;
        if (finished % 100 === 0) {
          if (!process.argv.includes("--offline"))
            await fs.writeFile(
              failureCache,
              JSON.stringify(priorFailures, null, 2),
            );
          console.log(JSON.stringify({ finished, total: missingList.length }));
        }
      }
    }
  }),
);
if (!process.argv.includes("--offline"))
  await fs.writeFile(failureCache, JSON.stringify(priorFailures, null, 2));
function rewriteCss(css, base) {
  return css
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g, (_, a, b, c) => {
      const source = (a || b || c || "").trim();
      if (/^(data:|#)/i.test(source))
        return `url("${source.replaceAll('"', "%22")}")`;
      const local = resolveAsset(source, base);
      return local ? `url("${local}")` : 'url("data:,")';
    })
    .replace(/@import\s*(['"])([^'"]+)\1/g, (_, q, value) => {
      const local = resolveAsset(value, base);
      return local ? `@import url("${local}")` : '@import url("data:,")';
    });
}
for (const asset of assets.values())
  if (asset.css)
    await writeChanged(
      "public" + asset.file,
      rewriteCss(asset.buffer.toString("utf8"), asset.url),
    );
let requested = {};
try {
  requested =
    JSON.parse(await fs.readFile("artifacts/site-mirror/queue.json", "utf8"))
      .byKey || {};
} catch {}
const empty = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
for (const f of files) {
  const snapshot = JSON.parse(
      await fs.readFile(path.join(captureDir, f), "utf8"),
    ),
    source = canonicalSchoolUrl(snapshot.url);
  if (!source || !snapshot.html || snapshot.html.includes("[Truncated]")) {
    failures.push({
      url: snapshot.url,
      reason: "Missing/truncated source snapshot",
    });
    continue;
  }
  const $ = load(snapshot.html);
  if ($("body.logged-in,#wpadminbar").length) {
    failures.push({ url: source, reason: "Authenticated page excluded" });
    continue;
  }
  $(
    'script,noscript,[id^=codex-browser],.saa-loading,base,object,embed,meta[name*=token i],meta[name*=csrf i],meta[http-equiv],input[type=hidden],link[rel=preconnect],link[rel=dns-prefetch],link[rel=canonical],link[rel=alternate],link[rel="https://api.w.org/"]',
  ).remove();
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    if (style.includes("2147483647")) {
      $(el).remove();
      return;
    }
    $(el).attr("style", rewriteCss(style, source));
  });
  $("style").each((_, el) => $(el).text(rewriteCss($(el).text(), source)));
  $("*").each((_, el) => {
    for (const name of Object.keys(el.attribs || {}))
      if (
        /^on/i.test(name) ||
        /nonce|integrity|csrf|token/i.test(name) ||
        name === "ping" ||
        name === "autofocus"
      )
        $(el).removeAttr(name);
  });
  $("link[href]").each((_, el) => {
    const local = resolveAsset($(el).attr("href"), source);
    if (local) $(el).attr("href", local).removeAttr("crossorigin");
    else $(el).remove();
  });
  $("img,source,video,audio").each((_, el) => {
    const responsive = $(el).attr("data-srcset") || $(el).attr("srcset") || "";
    const candidates = responsive
      .split(",")
      .map((value) => {
        const match = value.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?[wx])$/);
        if (!match) return null;
        const local = resolveAsset(match[1], source);
        return local ? { file: local, descriptor: match[2] } : null;
      })
      .filter(Boolean);
    const original = $(el).attr("src"),
      lazy = $(el).attr("data-lazy-src") || $(el).attr("data-src"),
      chosen =
        lazy && (!original || /^data:/i.test(original)) ? lazy : original;
    for (const [name, old] of [
      ["src", chosen],
      ["poster", $(el).attr("poster")],
    ]) {
      if (!old) continue;
      const local =
        resolveAsset(old, source) ||
        (name === "src" ? candidates[0]?.file : null);
      if (local) $(el).attr(name, local);
      else {
        $(el).attr(name, empty);
        failures.push({
          url: assetKey(old, source),
          page: source,
          reason: "Uncaptured media",
        });
      }
    }
    if (candidates.length)
      $(el).attr(
        "srcset",
        candidates.map((c) => c.file + " " + c.descriptor).join(", "),
      );
    else $(el).removeAttr("srcset");
    $(el)
      .removeAttr("data-srcset")
      .removeAttr("data-src")
      .removeAttr("data-lazy-src");
    if (el.tagName === "img" && !$(el).attr("alt")) $(el).attr("alt", "");
  });
  $("use,image").each((_, el) => {
    for (const name of ["href", "xlink:href"]) {
      const raw = $(el).attr(name);
      if (!raw || raw.startsWith("#")) continue;
      const local = resolveAsset(raw, source);
      if (local) $(el).attr(name, local);
      else $(el).removeAttr(name);
    }
  });
  $("iframe").each((_, el) => {
    const title = $(el).attr("title") || "Embedded external service";
    const box = $(
      '<div class="mirror-embedded-service" role="note"></div>',
    ).text(title + " · external embedded service");
    const style = $(el).attr("style");
    if (style) box.attr("style", style);
    box.attr(
      "data-original-src",
      assetKey($(el).attr("src") || "", source).split("?")[0],
    );
    $(el).replaceWith(box);
  });
  $("form").each((_, el) => {
    const form = $(el),
      search =
        form.find("input[type=search],input[name=s],input[name=search]")
          .length > 0;
    form
      .attr("data-mirror-form", search ? "search" : "disconnected")
      .removeAttr("action")
      .removeAttr("method")
      .removeAttr("target");
    if (!search) {
      form.find("input,textarea,select,button").attr("disabled", "disabled");
      form.append(
        '<p role="note" class="mirror-form-note">Interface copy — submissions and school sign-in are not connected.</p>',
      );
    }
  });
  $("input[type=password]").attr("disabled", "disabled").removeAttr("value");
  $("input").removeAttr("value");
  $("textarea").text("");
  $(".newsword[role=tabpanel]").removeAttr("role");
  $("[role=tablist]>li").attr("role","presentation");
  $("form[data-mirror-form=search] input[type=submit]:not([value])").attr(
    "value",
    "搜尋",
  );
  const links = [];
  $("a[href],area[href]").each((_, el) => {
    const raw = $(el).attr("href") || "";
    if (raw.startsWith("#")) {
      if (!$(el).text().trim() && !$(el).attr("aria-label"))
        $(el).attr("aria-label", $(el).attr("title") || "Menu");
      return;
    }
    if (/^(?:javascript|data|vbscript|file):/i.test(raw)) {
      $(el).attr("href", "#").attr("data-mirror-inert", "true");
      return;
    }
    try {
      const absolute = new URL(raw, source);
      const localAsset = resolveAsset(absolute.href, source),
        local = localAsset || localSchoolHref(absolute.href, source);
      if (local) {
        $(el)
          .attr("href", local)
          .attr("data-school-local", "true")
          .removeAttr("target");
        links.push({
          source: absolute.href,
          href: local,
          text: $(el).text().trim().slice(0, 160),
        });
      } else if (["https:", "http:"].includes(absolute.protocol)) {
        $(el)
          .attr("href", absolute.href)
          .attr("target", "_blank")
          .attr("rel", "noopener noreferrer")
          .attr("data-third-party", "true");
        const label=$(el).attr('aria-label')||$(el).text().trim()||$(el).find('img').attr('alt')||'Linked service';
        $(el).attr('aria-label',label+' (external service)').attr('title',( $(el).attr('title')||label)+' (external service)');
      } else if (
        !["mailto:", "tel:"].includes(absolute.protocol) &&
        !raw.startsWith("#")
      )
        $(el).removeAttr("href");
    } catch {
      $(el).removeAttr("href");
    }
    if (!$(el).text().trim() && !$(el).attr("aria-label"))
      $(el).attr(
        "aria-label",
        $(el).attr("title") ||
          $(el).find("img").attr("alt") ||
          "Open linked page",
      );
  });
  $("[data-ha-element-link]").each((_, el) => {
    try {
      const raw = JSON.parse($(el).attr("data-ha-element-link"));
      const local = localSchoolHref(raw.url, source);
      if (local)
        $(el)
          .attr("data-mirror-link", local)
          .attr("role", "link")
          .attr("tabindex", "0");
    } catch {}
    $(el).removeAttr("data-ha-element-link");
  });
  $(".elementor-invisible").removeClass("elementor-invisible");
  $("[data-settings]").each((_, el) => {
    try {
      const v = JSON.parse($(el).attr("data-settings"));
      const clean = {};
      for (const key of [
        "slides_to_show",
        "slides_to_show_tablet",
        "slides_to_show_mobile",
        "slides_to_scroll",
      ])
        if (v[key]) clean[key] = v[key];
      $(el).attr("data-mirror-settings", JSON.stringify(clean));
    } catch {}
    $(el).removeAttr("data-settings");
  });
  $("head").prepend(
    "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'\">",
  );
  $("head").append(
    "<style>.head_inner{box-sizing:border-box;max-width:100%}@media(max-width:980px){body.wp-theme-noob *{box-sizing:border-box}body.wp-theme-noob #branding #title{width:calc(100% - 24px);max-width:100%;left:12px;right:12px;background-size:contain;background-repeat:no-repeat;background-position:center}body.wp-theme-noob #branding img{width:100%!important;max-width:100%!important;height:auto!important}body.wp-theme-noob #branding h1{margin:0;padding:12px 8px}body.wp-theme-noob #site-title span{display:block;font-size:clamp(20px,6vw,30px);white-space:normal}body.wp-theme-noob .site-info{width:100%;max-width:100%}body.wp-theme-noob #access .menu-header,body.wp-theme-noob #access ul{margin:0;padding-left:0}body.wp-theme-noob #wrapper,body.wp-theme-noob #header,body.wp-theme-noob #masthead,body.wp-theme-noob #main,body.wp-theme-noob #access,body.wp-theme-noob #branding,body.wp-theme-noob #footer,body.wp-theme-noob #colophon{box-sizing:border-box;width:100%;max-width:100%}body.wp-theme-noob #site-title{width:100%;float:none;margin-left:0;margin-right:0}body.wp-theme-noob #site-description{width:auto;float:none;margin:0 12px}body.wp-theme-noob #access .menu-header{width:100%}body.wp-theme-noob #access ul{display:flex;flex-wrap:wrap}body.wp-theme-noob #access .sub-menu{display:none}body.wp-theme-noob #access li:hover>.sub-menu{display:block}}@media(max-width:767px){body{overflow-wrap:anywhere}.head_inner{box-sizing:border-box;max-width:100%}.elementor-button{max-width:100%;white-space:normal}.elementor-button-content-wrapper,.elementor-button-text{min-width:0;white-space:normal;overflow-wrap:anywhere}.wp-theme-noob #branding h1,.wp-theme-noob #branding span{max-width:100%}}.site-header[style]{width:100%!important}.elementor-section-stretched{width:100%!important;left:0!important}.mirror-form-note{font:12px/1.5 system-ui,sans-serif;padding:8px;border:1px solid #a9c8c1;background:#f5faf8;color:#244d43}.mirror-embedded-service{display:grid;place-items:center;min-height:180px;max-width:100%;background:#17211f;color:white;font:14px/1.5 system-ui;padding:20px}.menu-item-has-children:hover>.sub-menu,.menu-item-has-children:focus-within>.sub-menu{display:block!important}.mirror-selected-slide{display:block!important}.mirror-hidden-slide{display:none!important}</style>",
  );
  const name = hash(source).slice(0, 20) + ".html",
    html = "<!doctype html>\n" + $.html().replace(/<!doctype[^>]*>/gi, "");
  const aliases = [source, requested[path.basename(f, ".json")]?.url].filter(
    Boolean,
  );
  if (f === "international-cooperation.json")
    aliases.push("https://www.oica.stu.edu.tw/");
  const previous = pages.find((p) => p.source === source);
  if (previous) {
    previous.aliases = [...new Set([...previous.aliases, ...aliases])];
    continue;
  }
  await writeChanged(path.join(pageDir, name), html);
  pages.push({
    source,
    title: snapshot.title,
    route: localSchoolHref(source),
    file: "/school-pages/" + name,
    capturedOn: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
    }).format(
      new Date(
        snapshot.capturedAt || (await fs.stat(path.join(captureDir, f))).mtime,
      ),
    ),
    aliases,
    links: links.length,
    checksum: hash(html),
    text: $("body").text().replace(/\s+/g, " ").trim(),
  });
}
for (const p of pages) {
  p.aliases = [
    ...new Set([
      ...p.aliases,
      ...Object.values(queue.records)
        .filter((r) => canonicalSchoolUrl(r.actual || "") === p.source)
        .map((r) => r.url),
    ]),
  ];
}
for (const p of pages)
  p.aliases = p.aliases.filter(
    (alias) =>
      !pages.some(
        (other) => other !== p && other.source === canonicalSchoolUrl(alias),
      ),
  );
const coverage = Object.values(queue.records).map((r) => ({
  source: r.url,
  route: localSchoolHref(r.url),
  title: r.title || "",
  depth: r.depth,
  status: resolveAsset(r.url)
    ? "file-copied"
    : pages.some((p) => p.aliases.includes(r.url))
      ? "page-copied"
      : r.status === "captured"
        ? "capture-needs-import"
        : r.status,
}));
await fs.writeFile(
  "src/features/public/mirror/coverage.json",
  JSON.stringify(
    {
      capturedOn: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
      }).format(new Date()),
      pages: pages.length,
      records: coverage,
    },
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  "src/features/public/mirror/assets.json",
  JSON.stringify(
    [...assets.values()].map((a) => ({
      source: a.url,
      file: a.file,
      checksum: a.css
        ? hash(rewriteCss(a.buffer.toString("utf8"), a.url))
        : a.sourceChecksum,
      sourceChecksum: a.sourceChecksum,
      bytes: a.css
        ? Buffer.byteLength(rewriteCss(a.buffer.toString("utf8"), a.url))
        : a.bytes,
    })),
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  "src/features/public/mirror/files.json",
  JSON.stringify(
    [...assets.values()]
      .filter((a) => /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/.test(a.file))
      .map((a) => ({ source: canonicalSchoolUrl(a.url), file: a.file })),
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  "src/features/public/mirror/gaps.json",
  JSON.stringify(
    coverage
      .filter(
        (r) =>
          ![
            "page-copied",
            "file-copied",
            "pending",
            "document-pending",
          ].includes(r.status),
      )
      .map((r) => ({ source: r.source, status: r.status })),
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  "src/features/public/mirror/pages.json",
  JSON.stringify(
    pages.map(({ text: _text, ...p }) => p),
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  "public/school-pages/search.json",
  JSON.stringify(
    pages.map((p) => ({ title: p.title, route: p.route, text: p.text })),
  ) + "\n",
);
await fs.writeFile(
  "artifacts/site-mirror/build-report.json",
  JSON.stringify(
    {
      pages: pages.length,
      assets: assets.size,
      failures: [
        ...new Map(
          failures
            .filter((f) => !resolveAsset(f.url))
            .map((f) => [f.url + "|" + (f.page || ""), f]),
        ).values(),
      ],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    pages: pages.length,
    assets: assets.size,
    failures: failures.length,
  }),
);

const currentAssetFiles = new Set(
  [...assets.values()].map((a) => path.basename(a.file)),
);
for (const file of await fs.readdir(assetDir))
  if (/^[a-f0-9]{20}\.[a-z0-9]+$/.test(file) && !currentAssetFiles.has(file))
    await fs.unlink(path.join(assetDir, file));

const missingResources=[...new Map(failures.filter(f=>safeAssetUrl(f.url)&&!resolveAsset(f.url)).map(f=>[f.url+'|'+(f.page||''),{source:f.url,page:f.page||null,reason:/404/.test(f.reason)?'not_found':/403/.test(f.reason)?'forbidden':/exceeds/.test(f.reason)?'too_large':/timed? ?out/i.test(f.reason)?'timeout':f.reason==='Uncaptured media'?'media_missing':'source_unavailable'}])).values()];
await fs.writeFile('src/features/public/mirror/import-warnings.json',JSON.stringify(missingResources,null,2)+'\n');
