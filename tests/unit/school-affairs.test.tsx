import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  portalGroups,
  portalPrograms,
  getMenuPrograms,
  filterPrograms,
} from "../../src/features/public/affairs/model";
import {
  defaultPreferences,
  sanitizePreferences,
  readPreferences,
  savePreferences,
} from "../../src/features/public/affairs/preferences";
import { referenceHref } from "../../src/features/public/site/reference";

test("School Affairs catalog matches the independently captured source fingerprint, 57 rows and 94 links", () => {
  const catalog = JSON.parse(
    readFileSync("src/features/public/affairs/catalog.json", "utf8"),
  );
  let hash = 2166136261;
  for (const char of JSON.stringify(catalog))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  assert.equal((hash >>> 0).toString(16), "2c924bd6");
  assert.equal(catalog.length, 57);
  assert.equal(portalPrograms.length, 94);
  assert.equal(new Set(portalPrograms.map((p) => p.id)).size, 94);
  assert.equal(portalGroups.length, 7);
  assert.equal(portalGroups.flatMap((g) => g.views).length, 25);
  for (const program of portalPrograms) {
    const url = new URL(`https://${program.sourcePath}`);
    assert.ok(
      url.hostname.endsWith(".stu.edu.tw") || url.hostname === "www.stu.edu.tw",
    );
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
  }
});
test("portal menu scopes, common aliases, course selection and custom menus resolve to known programs", () => {
  for (const group of portalGroups)
    for (const [view] of group.views)
      for (const program of getMenuPrograms(group.id, view, ["6-1", "13-1"]))
        assert.ok(portalPrograms.some((p) => p.id === program.id));
  assert.equal(getMenuPrograms("menu", "common").length, 15);
  assert.equal(getMenuPrograms("menu", "course").length, 10);
  assert.equal(
    getMenuPrograms("menu", "graduation")[0].title,
    "離校申請狀態查詢",
  );
  assert.equal(getMenuPrograms("menu", "custom").length, 0);
  assert.deepEqual(
    getMenuPrograms("menu", "custom", ["6-1"]).map((p) => p.title),
    ["初選"],
  );
  assert.equal(filterPrograms(portalPrograms, "  ＭＯＯＤＬＥ ").length, 1);
  assert.deepEqual(
    filterPrograms(portalPrograms, "課程大綱 查詢").map((p) => p.title),
    ["課程大綱查詢"],
  );
  assert.equal(filterPrograms(portalPrograms, "不存在的程式").length, 0);
});
test("preview preferences reject arbitrary records and sanitize damaged or oversized settings", () => {
  assert.deepEqual(sanitizePreferences(null), defaultPreferences);
  const value = sanitizePreferences({
    collapsed: "false",
    theme: "unknown",
    fontSize: 999,
    favorites: ["6-1", "6-1", "unknown", {}],
    bookmarks: ["news-0", "news-0", "missing"],
    fixedNavbar: true,
  });
  assert.equal(value.collapsed, false);
  assert.equal(value.theme, "blue");
  assert.equal(value.fontSize, 20);
  assert.equal(value.fixedNavbar, true);
  assert.deepEqual(value.favorites, ["6-1"]);
  assert.deepEqual(value.bookmarks, ["news-0"]);
  assert.equal(sanitizePreferences({ fontSize: NaN }).fontSize, 14);
});
test("blocked browser storage degrades to usable in-memory defaults", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    },
  });
  try {
    assert.deepEqual(readPreferences(), defaultPreferences);
    assert.equal(savePreferences(defaultPreferences), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
test("only the copied School Affairs entry becomes local; protected program destinations remain official", () => {
  for (const href of [
    "https://info.stu.edu.tw/",
    "https://info.stu.edu.tw/ePortal/login.asp",
    "https://info.stu.edu.tw/ePortal/index.asp",
  ])
    assert.equal(referenceHref(href), "/school-affairs");
  assert.equal(
    referenceHref("https://info.stu.edu.tw/ACA/student/CM/cm.asp"),
    "https://info.stu.edu.tw/ACA/student/CM/cm.asp",
  );
});
