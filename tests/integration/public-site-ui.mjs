import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("This preview suite is local-only.");
await mkdir("artifacts/stu-reference/qa", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const rows = [];
try {
  for (const width of [1280, 768, 390, 320]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of ["/", "/在校學生/", "/student-sso"]) {
      await page.goto(base + route);
      await page.locator(".public-site-shell").waitFor();
      if (route === "/在校學生/") {
        assert.equal(await page.locator(".student-category").count(), 7);
        assert.equal(await page.locator(".student-category li").count(), 72);
        assert.equal(await page.locator(".student-category a").count(), 70);
      }
      if (route === "/student-sso") {
        assert.equal(await page.locator("form").count(), 0);
        assert.deepEqual(
          await page.locator('.sso-reference-card input,.sso-reference-card button').evaluateAll(
            (nodes) => nodes.map((node) => ({
              background: getComputedStyle(node).backgroundColor,
              foreground: getComputedStyle(node).color,
            })),
          ),
          [
            { background: "rgb(228, 232, 238)", foreground: "rgb(73, 80, 87)" },
            { background: "rgb(228, 232, 238)", foreground: "rgb(73, 80, 87)" },
            { background: "rgb(95, 194, 182)", foreground: "rgb(23, 61, 53)" },
          ],
          "Reference control colors must survive shared shadcn theme overrides",
        );
        for (const field of await page.locator("input,fieldset button").all())
          assert.ok(await field.isDisabled());
        const outgoing = [];
        page.on("request", (r) => {
          if (r.method() !== "GET")
            outgoing.push({ method: r.method(), host: new URL(r.url()).host });
        });
        await page.keyboard.press("Enter");
        assert.equal(outgoing.length, 0);
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Horizontal overflow " + width + route,
      );
      await page.screenshot({
        path: `artifacts/stu-reference/qa/${route === "/" ? "home" : route.includes("sso") ? "sso" : "students"}-${width}.png`,
        fullPage: route !== "/",
      });
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const severe = scan.violations.filter((x) =>
        ["serious", "critical"].includes(x.impact),
      );
      assert.equal(
        severe.length,
        0,
        JSON.stringify({
          width,
          route,
          violations: severe.map((x) => ({
            id: x.id,
            nodes: x.nodes.map((n) => n.target),
          })),
        }),
      );
      rows.push({
        width,
        route,
        overflow: 0,
        severe: 0,
        pageErrors: errors.length,
      });
      console.log(JSON.stringify(rows.at(-1)));
    }
    await page.goto(base);
    await page.getByRole("button", { name: "下一張輪播", exact: true }).click();
    await page
      .getByRole("heading", { name: "樹德科大帶你後來居上", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "播放輪播", exact: true }).click();
    await page.getByRole("button", { name: "暫停輪播", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "播放輪播", exact: true }).count(),
      1,
    );
    await page.getByRole("tab", { name: "ALL", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "行政公告", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    assert.equal(await page.locator("#public-news-panel a").count(), 8);
    await page.keyboard.press("End");
    assert.equal(
      await page
        .getByRole("tab", { name: "其他事項", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.getByRole("tab", { name: "學生專區", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "教師專區", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.goto(base);
    await page.getByRole("link", { name: /在校學生 校務系統/ }).click();
    assert.equal(decodeURI(new URL(page.url()).pathname), "/在校學生/");
    await page.getByRole("link", { name: "學生Gmail", exact: true }).click();
    await page
      .getByRole("heading", { name: "Sign in to your account", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/student-sso");
    await page.reload();
    await page.getByRole("link", { name: "返回在校學生", exact: true }).click();
    await page
      .getByRole("heading", { name: "在校學生", exact: true })
      .waitFor();
    await page.goBack();
    await page
      .getByRole("heading", { name: "Sign in to your account", exact: true })
      .waitFor();
    await page.goto(
      base +
        "/auth/realms/stuarm/protocol/saml?SAMLRequest=expired-fixture&RelayState=https://outside.example",
    );
    await page.waitForURL(base + "/student-sso");
    assert.equal(await page.locator("form").count(), 0);
    await page.goto(base + "/在校學生/");
    if (width <= 640) {
      const toggle = page.getByRole("button", {
        name: "開啟主選單",
        exact: true,
      });
      await toggle.click();
      await page
        .getByRole("navigation", { name: "主選單", exact: true })
        .getByRole("link")
        .first()
        .focus();
      await page.keyboard.press("Escape");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.ok(await toggle.evaluate((el) => el === document.activeElement));
    }
    await page
      .getByRole("link", { name: "STU Nexus 登入", exact: true })
      .click();
    await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/signin");
    assert.equal(errors.length, 0, JSON.stringify(errors));
    await context.close();
  }
  const darkContext = await browser.newContext({
    viewport: { width: 390, height: 900 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const darkPage = await darkContext.newPage();
  await darkContext.addInitScript(() => localStorage.setItem("theme", "dark"));
  for (const route of ["/", "/在校學生/", "/student-sso"]) {
    await darkPage.goto(base + route);
    await darkPage.locator(".public-site-shell").waitFor();
    assert.ok(
      await darkPage
        .locator("html")
        .evaluate((el) => el.classList.contains("light")),
      "The source-faithful public site must remain light even with a saved dark app preference.",
    );
    const scan = await new AxeBuilder({ page: darkPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.equal(
      scan.violations.filter((x) => ["serious", "critical"].includes(x.impact))
        .length,
      0,
    );
    assert.ok(
      await darkPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    rows.push({
      width: 390,
      route,
      preference: "dark",
      renderedTheme: "light",
      overflow: 0,
      severe: 0,
    });
  }
  await darkContext.close();
  const manifest = JSON.parse(
    await readFile("public/stu-reference/provenance.json", "utf8"),
  );
  for (const asset of manifest.assets) {
    const response = await fetch(base + asset.local);
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, asset.bytes);
  }
} finally {
  await browser.close();
  await writeFile(
    "artifacts/stu-reference/qa/results.json",
    JSON.stringify(rows, null, 2),
  );
}

console.log(
  JSON.stringify({
    status: "ok",
    states: rows.length,
    localNavigationWidths: 4,
    referenceAssets: 28,
    credentialSubmissionEnabled: false,
  }),
);
