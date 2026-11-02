import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadSchoolAsset,
  safeSchoolAssetUrl,
  schoolAssetIdentity,
} from "../../scripts/lib/download-school-asset.mjs";
const source = "https://www.stu.edu.tw/public.pdf";
async function withFetch(
  mock: typeof globalThis.fetch,
  run: () => Promise<void>,
) {
  const old = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = old;
  }
}
test("asset import rejects foreign hosts, credentials and nonstandard ports", () => {
  for (const url of [
    "https://evil.test/x",
    "https://stu.edu.tw.evil.test/x",
    "file:///tmp/a",
    "https://u:p@www.stu.edu.tw/x",
    "http://www.stu.edu.tw:8080/a",
  ])
    assert.equal(safeSchoolAssetUrl(url), false);
  assert.equal(safeSchoolAssetUrl(source), true);
  assert.equal(safeSchoolAssetUrl("https://fonts.gstatic.com/a.woff2"), true);
  assert.equal(safeSchoolAssetUrl("https://ap9.ragic.com/sims/file.jsp?a=stualumnitw&f=public-image.png"), true);
});
test("asset redirects are checked before contacting a different host", async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      });
    },
    async () => {
      await assert.rejects(
        downloadSchoolAsset(source),
        /Unapproved asset redirect/,
      );
      assert.equal(calls, 1);
    },
  );
});
test("an unresponsive asset body has a bounded deadline", async () => {
  await withFetch(
    async () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { "content-type": "application/pdf" },
      }),
    async () => {
      const start = Date.now();
      await assert.rejects(
        downloadSchoolAsset(source, { timeout: 20 }),
        /timed out/,
      );
      assert.ok(Date.now() - start < 1000);
    },
  );
});
test("asset importer rejects HTML and oversized responses", async () => {
  await withFetch(
    async () =>
      new Response("<html>login</html>", {
        headers: { "content-type": "text/html" },
      }),
    async () => {
      await assert.rejects(downloadSchoolAsset(source), /HTML response/);
    },
  );
  await withFetch(
    async () =>
      new Response("large", {
        headers: { "content-type": "application/pdf", "content-length": "100" },
      }),
    async () => {
      await assert.rejects(
        downloadSchoolAsset(source, { maxBytes: 4 }),
        /size limit/,
      );
    },
  );
});
test("asset importer returns static bytes without executing source content", async () => {
  await withFetch(
    async () =>
      new Response("%PDF-public", {
        headers: { "content-type": "application/pdf" },
      }),
    async () => {
      const asset = await downloadSchoolAsset(source);
      assert.equal(asset.buffer.toString(), "%PDF-public");
      assert.equal(asset.type, "application/pdf");
    },
  );
});

test("asset aliases preserve document-selecting query strings", () => {
  assert.equal(
    schoolAssetIdentity("http://www.stu.edu.tw/file.pdf?id=1"),
    schoolAssetIdentity("https://www.stu.edu.tw/file.pdf?id=1"),
  );
  assert.notEqual(
    schoolAssetIdentity("https://www.stu.edu.tw/download?id=1"),
    schoolAssetIdentity("https://www.stu.edu.tw/download?id=2"),
  );
});
