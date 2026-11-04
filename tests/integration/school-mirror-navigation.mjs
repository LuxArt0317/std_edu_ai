import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const origin = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Mirror navigation regression test must use a local server");

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseStyles;
  await page.route("**/school-assets/f4facb8fc59276f8f204.css", async (route) => {
    await new Promise((resolve) => { releaseStyles = resolve; });
    await route.continue().catch(() => {});
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("iframe")?.contentDocument?.documentElement?.dataset.mirrorReady === "true",
    null,
    { timeout: 8000 },
  );
  assert.equal(await page.locator(".mirror-loading").count(), 0);
  assert.equal(await page.locator(".source-mirror").getAttribute("aria-busy"), "false");
  assert.equal(typeof releaseStyles, "function", "the slow stylesheet was intercepted");
  assert.equal(await page.locator("iframe").evaluate((frame) => frame.contentDocument.readyState), "loading");
  const frame = page.frameLocator(".source-mirror iframe");
  await frame.getByRole("link", { name: /在校學生/ }).filter({ has: frame.locator("h3") }).first().click();
  await page.waitForURL("**/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/");
  releaseStyles?.();
  await page.waitForFunction(
    () => document.querySelector("iframe")?.contentDocument?.documentElement?.dataset.mirrorReady === "true",
    null,
    { timeout: 15000 },
  );
  assert.match(await frame.locator("body").innerText(), /在校學生/);
  assert.deepEqual(errors, []);
  await page.close();

  const missing = await browser.newPage();
  const shell = await readFile("index.html", "utf8");
  await missing.route("**/school-pages/5d6829073ddd38c7749f.html*", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: shell }),
  );
  await missing.goto(origin + "/在校學生/", { waitUntil: "domcontentloaded" });
  await missing.getByRole("alert").filter({ hasText: "copied page is unavailable" }).waitFor();
  assert.equal(await missing.locator(".source-mirror[aria-busy=true] iframe").count(), 1);
  await missing.close();
  console.log("Mirror navigation works before slow stylesheets finish; missing captures show an error.");
} finally {
  await browser.close();
}
