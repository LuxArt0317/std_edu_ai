import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Local UI suite only");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const evidence = [];
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "stu-nexus-auth",
      "unrelated-knowledge-manager-session",
    ),
  );
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + "/school-affairs");
    await page
      .getByRole("heading", { name: "校務系統登入", exact: true })
      .waitFor();
    assert.equal(await page.locator("#affairs-account").isDisabled(), true);
    assert.equal(
      await page
        .getByRole("button", { name: "Login", exact: true })
        .isDisabled(),
      true,
    );
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      scan.violations
        .filter((v) => ["critical", "serious"].includes(v.impact))
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const image = page.getByAltText("校園健身中心");
    assert.ok(await image.evaluate((i) => i.complete && i.naturalWidth > 0));
    await page.getByRole("button", { name: "Next campus photo" }).click();
    await page.getByAltText("校園建築").waitFor();
    await page.getByRole("button", { name: "Previous campus photo" }).click();
    await page.getByRole("button", { name: "資訊系統選單(MENU)" }).click();
    await page
      .getByRole("heading", { name: "資訊服務選單", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "登入說明", exact: true }).click();
    await page
      .getByRole("heading", { name: "登入說明", exact: true })
      .waitFor();
    evidence.push({
      width,
      login: true,
      formDisabled: true,
      seriousCritical: 0,
      overflow: false,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/school-affairs/login");
  await page.getByRole("button", { name: "瀏覽示範校務介面" }).click();
  await page.locator(".portal-content").waitFor();
  await page.locator(".portal-logout").click();
  await page
    .getByRole("heading", { name: "校務系統登入", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("stu-affairs-preview-v1")),
    null,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("stu-nexus-auth")),
    "unrelated-knowledge-manager-session",
  );
  await page.goto(base + "/school-affairs/menu/aca/all");
  await page
    .getByRole("heading", { name: "校務系統登入", exact: true })
    .waitFor();
  await page.goto(base + "/ePortal/login.asp");
  await page.waitForURL("**/school-affairs/login");
  assert.deepEqual(errors, []);
  await mkdir("artifacts/affairs-identity", { recursive: true });
  await page.screenshot({
    path: "artifacts/affairs-identity/login-final.png",
    fullPage: true,
  });
  await writeFile(
    "artifacts/affairs-identity/ui-qa.json",
    JSON.stringify(
      {
        evidence,
        logoutClearsPreview: true,
        nexusSessionPreserved: true,
        privateRouteGuarded: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      states: evidence.length,
      logoutAndIdentityIsolation: true,
    }),
  );
} finally {
  await browser.close();
}
