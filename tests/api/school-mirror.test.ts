import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  findSchoolPage,
  canonicalSchoolUrl,
  localSchoolHref,
  sourceForLocalPath,
} from "../../src/features/public/mirror/paths.ts";
type Page = {
  source: string;
  title: string;
  route: string;
  file: string;
  aliases: string[];
  checksum: string;
};
const pages: Page[] = JSON.parse(
  fs.readFileSync("src/features/public/mirror/pages.json", "utf8"),
);
test("school URL policy retains local paths and rejects foreign or credential URLs", () => {
  for (const value of [
    "",
    "javascript:alert(1)",
    "https://stu.edu.tw.evil.test/a",
    "https://evil.test/a",
    "https://u:p@stu.edu.tw/a",
    "https://stu.edu.tw:9999/a",
  ])
    assert.equal(canonicalSchoolUrl(value), null, value);
  assert.equal(
    canonicalSchoolUrl("http://stu.edu.tw/在校學生/#section"),
    "https://www.stu.edu.tw/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/",
  );
  assert.equal(
    canonicalSchoolUrl(
      "https://www.stu.edu.tw/x?token=private&id=42&RelayState=private",
    ),
    "https://www.stu.edu.tw/x?id=42",
  );
  assert.doesNotThrow(() => localSchoolHref("https://www.stu.edu.tw/%E0%A4%A"));
});
test("ten audience destinations and school identity boundaries map locally", () => {
  for (const [source, route] of [
    ["https://reg.aca.stu.edu.tw/", "/admissions"],
    ["https://freshman.stu.edu.tw/", "/freshman"],
    ["https://alumnus.sao.stu.edu.tw/", "/alumni-association"],
    ["https://www.oica.stu.edu.tw/en/", "/international"],
    ["https://info.stu.edu.tw/ePortal/login.asp", "/school-affairs/login"],
    ["https://sso2.stu.edu.tw/auth?SAMLRequest=private", "/student-sso"],
  ])
    assert.equal(localSchoolHref(source), route);
  assert.equal(
    localSchoolHref("https://life.sao.stu.edu.tw/test/?id=2#section"),
    "/school-sites/life.sao.stu.edu.tw/test/?id=2#section",
  );
  assert.equal(sourceForLocalPath("/school-sites/evil.test/x"), null);
  assert.equal(
    sourceForLocalPath("/admissions"),
    "https://reg.aca.stu.edu.tw/",
  );
  for (const name of [
    "在校學生",
    "教職員工",
    "進修人士",
    "畢業校友",
    "校外訪客",
    "國際學生",
  ])
    assert.ok(
      pages.some(
        (p) =>
          p.source ===
          canonicalSchoolUrl("https://www.stu.edu.tw/" + name + "/"),
      ),
      name,
    );
});
test("captured pages are unique, complete inert documents with local school navigation and assets", () => {
  assert.ok(pages.length >= 11);
  assert.equal(new Set(pages.map((p) => p.source)).size, pages.length);
  for (const p of pages) {
    const html = fs.readFileSync("public" + p.file, "utf8"),
      $ = load(html);
    assert.match(html, /^<!doctype html>/i, p.source);
    assert.ok(!html.includes("[Truncated]"), p.source);
    assert.equal(
      createHash("sha256").update(html).digest("hex"),
      p.checksum,
      p.source,
    );
    assert.equal(
      $(
        "script,object,embed,iframe,base,[id^=codex-browser],input[type=hidden]",
      ).length,
      0,
      p.source,
    );
    assert.match(
      $('meta[http-equiv="Content-Security-Policy"]').attr("content") || "",
      /script-src 'none'/,
      p.source,
    );
    $("*").each((_, el) => {
      for (const key of Object.keys($(el).attr() || {}))
        assert.ok(!/^on/i.test(key), key + " " + p.source);
    });
    $("img[src],link[rel=stylesheet][href]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      assert.ok(
        src.startsWith("/school-assets/") || src.startsWith("data:"),
        src,
      );
      if (src.startsWith("/")) assert.ok(fs.existsSync("public" + src), src);
    });
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      assert.ok(
        !/^https?:\/\/(?:[\w.-]+\.)?stu\.edu\.tw(?:\/|$)/i.test(href),
        p.source + " " + href,
      );
      assert.ok(!/^(?:javascript|vbscript|data):/i.test(href), href);
    });
    $(
      "form:not([data-mirror-form=search]) input,form:not([data-mirror-form=search]) button,input[type=password]",
    ).each((_, el) => assert.ok($(el).is("[disabled]"), p.source));
  }
});

test("school page names cannot collide with Nexus or local portal routes", () => {
  for (const path of [
    "/app",
    "/signin",
    "/admissions",
    "/school-affairs",
    "/APP/users",
  ])
    assert.equal(
      localSchoolHref("https://www.stu.edu.tw" + path),
      "/school-sites/www.stu.edu.tw" + path,
    );
});

test("canonical copies take precedence over stale redirect aliases", () => {
  const home = {
      source: "https://www.stu.edu.tw/",
      aliases: ["https://www.stu.edu.tw/detail"],
    },
    detail = { source: "https://www.stu.edu.tw/detail", aliases: [] };
  assert.equal(findSchoolPage([home, detail], detail.source), detail);
  assert.equal(findSchoolPage([home, detail], null), undefined);
});
test("versioned public media and styles match their delivered checksums", () => {
  const assets = JSON.parse(
    fs.readFileSync("src/features/public/mirror/assets.json", "utf8"),
  ) as Array<{ file: string; checksum: string }>;
  const seen = new Set<string>();
  for (const a of assets) {
    if (/\.(?:pdf|docx?|xlsx?|pptx?|zip|rar)$/.test(a.file) || seen.has(a.file))
      continue;
    seen.add(a.file);
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync("public" + a.file))
        .digest("hex"),
      a.checksum,
      a.file,
    );
  }
});

test("copied styles never import or load remote resources", () => {
  const files = fs
    .readdirSync("public/school-assets")
    .filter((f) => f.endsWith(".css"));
  for (const file of files) {
    const css = fs.readFileSync("public/school-assets/" + file, "utf8");
    assert.ok(
      !/@import\s*['"]https?:|url\(\s*['"]?(?:https?:|\/\/)/i.test(css),
      file,
    );
  }
});

test("redirect aliases have one authoritative page owner", () => {
  const seen = new Map<string, string>();
  for (const p of pages)
    for (const alias of p.aliases) {
      const key = canonicalSchoolUrl(alias)!;
      assert.ok(!seen.has(key) || seen.get(key) === p.source, key);
      seen.set(key, p.source);
    }
});
