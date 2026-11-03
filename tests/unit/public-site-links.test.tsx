import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { studentCategories } from "../../src/features/public/site/student-links";
import { referenceHref } from "../../src/features/public/site/reference";

function inventoryHash(value: unknown) {
  let n = 2166136261;
  for (const c of JSON.stringify(value))
    n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0).toString(16);
}
test("all 72 student entries match the browser-observed seven-category source inventory", () => {
  const normalized = studentCategories.map((category) => ({
    title: category.title,
    items: category.items.map((item) => [
      item.title,
      item.href
        ? new URL(item.href).href.replace(/%[a-f\d]{2}/gi, (x) =>
            x.toUpperCase(),
          )
        : null,
    ]),
  }));
  const expected = [
    "47c7df31",
    "91ff8011",
    "28fe02b9",
    "cced57a7",
    "4efa3734",
    "fb8e1077",
    "b6052901",
  ];
  assert.deepEqual(normalized.map(inventoryHash), expected);
  assert.equal(inventoryHash(normalized), "779bcfe0");
  assert.equal(
    studentCategories.flatMap((x) => x.items).filter((x) => !x.href).length,
    2,
  );
});
test("school destinations become local while third-party links retain their source", () => {
  assert.equal(
    referenceHref(
      "https://www.stu.edu.tw/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/",
    ),
    "/在校學生/",
  );
  assert.equal(
    referenceHref("https://mail.google.com/a/stu.edu.tw"),
    "/student-sso",
  );
  assert.equal(
    referenceHref(
      "https://sso2.stu.edu.tw/auth/realms/stuarm/protocol/saml?SAMLRequest=expired",
    ),
    "/student-sso",
  );
  for (const item of studentCategories
    .flatMap((x) => x.items)
    .filter(
      (x) =>
        x.href &&
        !x.href.includes("mail.google.com") &&
        !x.href.includes("info.stu.edu.tw/ePortal/login.asp"),
    )) {
    const source = new URL(item.href!);
    if (
      source.hostname === "stu.edu.tw" ||
      source.hostname.endsWith(".stu.edu.tw")
    )
      assert.ok(referenceHref(item.href!).startsWith("/"), item.href!);
    else assert.equal(referenceHref(item.href!), item.href);
  }
  assert.equal(
    referenceHref("https://other.example/?next=https://sso2.stu.edu.tw"),
    "https://other.example/?next=https://sso2.stu.edu.tw",
  );
});
test("all delivered reference assets match their checksums and retain source provenance", () => {
  const manifest = JSON.parse(
    readFileSync("public/stu-reference/provenance.json", "utf8"),
  );
  assert.ok(manifest.assets.length >= 30);
  for (let index = 0; index < 16; index++) {
    const source = `https://info.stu.edu.tw/ePortal/assets/images/stu${index}.jpg`;
    assert.ok(manifest.assets.some((asset: { source: string }) => asset.source === source), source);
  }
  for (const asset of manifest.assets) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync("public" + asset.local))
        .digest("hex"),
      asset.sha256,
    );
  }
});

test("dated homepage news snapshot covers five source categories and eight valid ALL items", () => {
  const snapshot = JSON.parse(
    readFileSync("src/features/public/site/news-snapshot.json", "utf8"),
  );
  const rows = Object.values(snapshot.categories).flat() as Array<
    [number, string]
  >;
  assert.equal(Object.keys(snapshot.categories).length, 5);
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows.map((row) => row[0])).size, 40);
  assert.equal(snapshot.allOrder.length, 8);
  for (const id of snapshot.allOrder)
    assert.ok(rows.some((row) => row[0] === id));
});
