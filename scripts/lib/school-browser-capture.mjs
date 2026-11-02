/** Called from the documented Cua REPL with an existing public-source tab. No browser/CDP client of its own. */
import fs from "node:fs/promises";
import path from "node:path";
function canonicalSchoolUrl(value, base) {
  if (!value?.trim()) return null;
  try {
    const u = new URL(value, base);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      (u.port && !["80","443"].includes(u.port)) ||
      !(u.hostname === "stu.edu.tw" || u.hostname.endsWith(".stu.edu.tw"))
    )
      return null;
    u.protocol = "https:";
    if (u.hostname === "stu.edu.tw") u.hostname = "www.stu.edu.tw";
    if (u.hostname === "oica.stu.edu.tw") u.hostname = "www.oica.stu.edu.tw";
    u.hash = "";
    for (const k of [...u.searchParams.keys()])
      if (
        /^(?:code|state|ticket)$|token|password|session|saml|relay|nonce/i.test(
          k,
        )
      )
        u.searchParams.delete(k);
    return u.href;
  } catch {
    return null;
  }
}
const root = new URL("../../artifacts/site-mirror/", import.meta.url).pathname;
const esc = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
function assertPublicCapture(value) {
  const canonical = canonicalSchoolUrl(value);
  if (!canonical) throw Error("Source redirects outside school website");
  const u = new URL(canonical);
  if (
    /^(?:sso2?|tcidentity|tc|edi3|vpn2?|dorm|dtm|elearning|infosys|go|info|my|office365)\.stu\.edu\.tw$/i.test(
      u.hostname,
    ) ||
    /^\/wp-admin(?:\/|$)/i.test(u.pathname)
  )
    throw Error("Requires school authentication integration");
  return canonical;
}
export async function capturePublicPage(tab, key) {
  if (!/^[a-z0-9-]{1,80}$/.test(key)) throw Error("Invalid capture key");
  assertPublicCapture(await tab.url());
  const p = await tab.playwright.evaluate(() => ({
    url: location.href,
    title: document.title,
    head: document.head.innerHTML,
    body: document.body.innerHTML,
    bodyClass: document.body.className,
    bodyStyle: document.body.getAttribute("style") || "",
    htmlClass: document.documentElement.className,
    htmlStyle: document.documentElement.getAttribute("style") || "",
    lang: document.documentElement.lang,
    images: [...document.images].map((e, index) => ({
      index,
      currentSrc: e.currentSrc,
    })),
    links: [...document.querySelectorAll("a[href]")].map((a) => ({
      url: a.href,
      text: (a.textContent || a.getAttribute("aria-label") || a.title || "")
        .trim()
        .slice(0, 160),
    })),
  }));
  assertPublicCapture(p.url);
  if (/\blogged-in\b/.test(p.bodyClass) || /id=["']wpadminbar["']/.test(p.body))
    throw Error("Authenticated source excluded");
  if (p.body.includes("[Truncated]"))
    p.body = (
      await tab.playwright.evaluate(
        () => document.body.innerHTML.match(/[\s\S]{1,60000}/g) || [],
      )
    ).join("");
  if (p.head.includes("[Truncated]"))
    p.head = (
      await tab.playwright.evaluate(
        () => document.head.innerHTML.match(/[\s\S]{1,60000}/g) || [],
      )
    ).join("");
  if (p.head.includes("[Truncated]") || p.body.includes("[Truncated]"))
    throw Error("Incomplete source export");
  p.capturedAt = new Date().toISOString();
  p.html = (
    '<!doctype html><html lang="' +
    esc(p.lang) +
    '" class="' +
    esc(p.htmlClass) +
    '" style="' +
    esc(p.htmlStyle) +
    '"><head>' +
    p.head +
    '</head><body class="' +
    esc(p.bodyClass) +
    '" style="' +
    esc(p.bodyStyle) +
    '">' +
    p.body +
    "</body></html>"
  )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<input\b[^>]*>/gi, (tag) =>
      /type\s*=\s*["']?hidden/i.test(tag)
        ? ""
        : tag.replace(/\svalue\s*=\s*("[^"]*"|'[^']*')/gi, ""),
    );
  delete p.head;
  delete p.body;
  p.links = p.links.map((l) => {
    const canonical = canonicalSchoolUrl(l.url, p.url);
    return canonical
      ? {
          ...l,
          url: canonical,
          observedUrl:
            new URL(l.url, p.url).protocol === "http:"
              ? canonical.replace(/^https:/, "http:")
              : canonical,
        }
      : l;
  });
  await fs.writeFile(
    path.join(root, "captures", key + ".json"),
    JSON.stringify(p),
  );
  const cap = await tab.capabilities.get("pageAssets"),
    inv = await cap.list();
  if (inv.assets.length) {
    const bundle = await cap.bundle({
      inventoryId: inv.id,
      kinds: ["image", "stylesheet", "font"],
    });
    await fs.writeFile(
      path.join(root, "captures", key + ".assets.json"),
      JSON.stringify(bundle),
    );
  }
  return { url: p.url, title: p.title, links: p.links.length };
}
export async function captureBatch(
  tab,
  { count = 15, maxDepth = Infinity, retry = false } = {},
) {
  const queue = JSON.parse(
      await fs.readFile(path.join(root, "queue.json"), "utf8"),
    ),
    pending = JSON.parse(
      await fs.readFile(path.join(root, "pending.json"), "utf8"),
    );
  const candidates = retry
    ? Object.values(queue.records).filter((r) =>
        ["source-unavailable", "capture-incomplete"].includes(r.status),
      )
    : pending;
  let processed = 0,
    failed = 0,
    started = Date.now();
  for (const row of candidates) {
    if (processed >= count || Date.now() - started > 38000) break;
    if (
      row.depth > maxDepth ||
      (!retry && queue.records[row.url]?.status !== "pending")
    )
      continue;
    processed++;
    try {
      await tab.goto(row.fetchUrl || row.url);
      assertPublicCapture(await tab.url());
      const ax=await tab.getAXState({emit:false});
      assertPublicCapture(await tab.url());
      if (new URL(row.url).hostname === "alumnus.sao.stu.edu.tw") {
        await tab.playwright.locator(".saa-loading").waitFor({state:"hidden",timeoutMs:15000});
      }
      // This public SPA renders its navigation before the profile API resolves.
      // A header-only snapshot is not a completed detail page.
      if (new URL(row.url).hostname === "alumnus.sao.stu.edu.tw" && /\/star\/detail\//.test(new URL(row.url).pathname)) {
        await tab.playwright.locator(".report").waitFor({state:"visible",timeoutMs:15000});
      }
      const title=await tab.title();
      if (
        /privacy error|not private|site can.t be reached|404|not found|403|forbidden|access denied|bad gateway/i.test(
          title || "",
        ) ||
        /ERR_CERT_|ERR_CONNECTION_|ERR_NAME_NOT_RESOLVED/.test(ax)
      )
        throw Error("Source unavailable: " + title);
      const captured = await capturePublicPage(tab, row.key);
      queue.records[row.url] = {
        ...row,
        status: "captured",
        actual: assertPublicCapture(captured.url),
        title: captured.title,
      };
    } catch (e) {
      failed++;
      queue.records[row.url] = {
        ...row,
        status: /split|export.*limit/i.test(e.message)
          ? "capture-incomplete"
          : "source-unavailable",
        error: e.message,
      };
    } finally {
      await fs.writeFile(
        path.join(root, "queue.json"),
        JSON.stringify(queue, null, 2),
      );
    }
  }
  return { processed, failed, last: await tab.url() };
}
