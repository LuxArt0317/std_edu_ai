import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const origin = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Boot recovery browser test must use a local server");

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const currentHtml = await readFile(process.env.BOOT_HTML_PATH || "index.html", "utf8");
  const stale = currentHtml.replace(
    /src="\/(?:src\/main\.tsx|assets\/index-[^\"]+\.js)"/,
    'src="/assets/index-from-previous-deployment.js"',
  );
  assert.notEqual(stale, currentHtml, "the current module entry was replaced");
  const page = await browser.newPage();
  const navigations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.route(origin + "/signin", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: stale }),
  );
  await page.goto(origin + "/signin", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /sign in/i }).first().waitFor({ timeout: 30000 });
  assert.ok(navigations.some((url) => url.includes("__stu_boot_recovery=")));
  assert.equal(new URL(page.url()).searchParams.has("__stu_boot_recovery"), false);
  assert.equal(await page.locator("[data-stu-boot]").count(), 0);
  await page.close();

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const disabled = await noScript.newPage();
  await disabled.goto(origin + "/school-affairs/login", { waitUntil: "domcontentloaded" });
  assert.match(await disabled.locator("body").innerText(), /JavaScript is required to use this website/);
  assert.doesNotMatch(await disabled.locator("body").innerText(), /Opening your workspace/);
  await noScript.close();
  console.log("Stale entry recovers to the current public app; no-script fallback is accurate.");
} finally {
  await browser.close();
}
