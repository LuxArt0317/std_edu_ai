import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { mockAffairsAuth } from "./helpers/affairs-auth.mjs";
const base = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("This portal preview suite is local-only.");
const directory = "artifacts/stu-reference/affairs-qa";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const evidence = [];
const errors = [];
const externalRequests = [];
async function scan(page, name, screenshot = false) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `Overflow: ${name}`,
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const severe = result.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact),
  );
  assert.deepEqual(
    severe.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    `Accessibility: ${name}`,
  );
  if (screenshot)
    await page.screenshot({
      path: `${directory}/${name}.png`,
      fullPage: false,
    });
  evidence.push({ name, overflow: 0, severe: 0 });
  console.log(JSON.stringify(evidence.at(-1)));
}
async function wire(context) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      externalRequests.push(url.origin + url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
}
const views = [
  ["menu", "custom", 0],
  ["menu", "common", 15],
  ["menu", "external", 5],
  ["menu", "help", 1],
  ["menu", "course", 10],
  ["menu", "graduation", 1],
  ["aca", "all", 34],
  ["aca", "input", 15],
  ["aca", "query", 17],
  ["aca", "portal", 2],
  ["sao", "all", 30],
  ["sao", "input", 18],
  ["sao", "query", 8],
  ["sao", "portal", 4],
  ["swd", "all", 11],
  ["swd", "input", 3],
  ["swd", "query", 8],
  ["rdd", "all", 5],
  ["rdd", "input", 3],
  ["rdd", "query", 1],
  ["rdd", "portal", 1],
  ["personal", "all", 4],
  ["personal", "input", 2],
  ["infoSystem", "all", 4],
  ["infoSystem", "library", 4],
];
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await wire(context);
  const page = await context.newPage();
  await mockAffairsAuth(context);
  for (const [group, view, count] of views) {
    await page.goto(`${base}/school-affairs/menu/${group}/${view}`);
    await page.locator("#portal-program-search").waitFor();
    assert.equal(
      await page.locator(".portal-content [data-program-id]").count(),
      count,
      `${group}/${view}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.goto(base + "/school-affairs/search");
  await page.locator("#portal-program-search").waitFor();
  assert.equal(
    await page.locator(".portal-content [data-program-id]").count(),
    94,
  );
  for (const a of await page
    .locator('.portal-content a[target="_blank"]')
    .all()) {
    const url = new URL(await a.getAttribute("href"));
    assert.ok(url.hostname.endsWith(".stu.edu.tw"));
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(await a.getAttribute("rel"), "noreferrer");
  }
  await page.getByLabel("系統名稱關鍵字", { exact: true }).fill("課程大綱");
  assert.equal(
    await page.locator(".portal-content [data-program-id]").count(),
    1,
  );
  await page.getByLabel("系統名稱關鍵字", { exact: true }).fill("不存在的程式");
  await page.getByText("找不到符合的系統。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "清除搜尋", exact: true }).click();
  assert.equal(
    await page.locator(".portal-content [data-program-id]").count(),
    94,
  );
  await page.getByRole("button", { name: /自訂選單設定:/ }).click();
  await page
    .getByRole("button", { name: "加入自訂選單：成績查詢", exact: true })
    .click();
  await page.goto(base + "/school-affairs/menu/menu/custom");
  await page.getByRole("link", { name: /^成績查詢/ }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: /^成績查詢/ }).waitFor();
  await page
    .getByRole("button", { name: "移除自訂選單：成績查詢", exact: true })
    .click();
  await page.getByText("尚未加入自訂選單。", { exact: true }).waitFor();
  await page.goto(base + "/school-affairs");
  await page.waitForFunction(() => document.title.startsWith("校務系統入口"));
  assert.equal(await page.locator("form,input[type=password]").count(), 0);
  await page.getByRole("button", { name: "收合最新消息", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: /^溝坪社區/ }).count(),
    0,
  );
  await page.getByRole("button", { name: "展開最新消息", exact: true }).click();
  const news = page.getByRole("button", { name: /^溝坪社區/ });
  await news.click();
  await page.getByRole("dialog").waitFor();
  await scan(page, "news-dialog-1280", true);
  await page.getByRole("button", { name: "收藏公告", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "取消收藏公告", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.ok(await news.evaluate((el) => el === document.activeElement));
  await page.goto(base + "/school-affairs/bookmarks");
  await page.getByRole("button", { name: /^溝坪社區/ }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /^溝坪社區/ }).click();
  await page.getByRole("button", { name: "取消收藏公告", exact: true }).click();
  await page.keyboard.press("Escape");
  await page
    .getByText("尚未收藏消息。可在公告視窗按下收藏圖示。", { exact: true })
    .waitFor();
  await page.goto(base + "/school-affairs");
  await page.getByRole("button", { name: "收合側邊欄", exact: true }).click();
  assert.equal(
    await page
      .locator(".portal-shell")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ")[0]),
    "43px",
  );
  await page.reload();
  await page.getByRole("button", { name: "展開側邊欄", exact: true }).click();
  const academic = page.getByRole("button", { name: "教務系統", exact: true });
  await academic.focus();
  await page.keyboard.press("Enter");
  assert.ok(await academic.evaluate((el) => el === document.activeElement));
  await page
    .getByRole("navigation", { name: "校務選單", exact: true })
    .getByRole("link", { name: "查詢程式", exact: true })
    .click();
  await page.waitForURL("**/school-affairs/menu/aca/query");
  await page.reload();
  await page
    .getByRole("heading", {
      level: 1,
      name: "教務系統 · 查詢程式",
      exact: true,
    })
    .waitFor();
  await page.getByRole("link", { name: "Index", exact: true }).click();
  await page.goBack();
  await page
    .getByRole("heading", {
      level: 1,
      name: "教務系統 · 查詢程式",
      exact: true,
    })
    .waitFor();
  await page.goto(base + "/school-affairs");
  await page.getByRole("button", { name: "介面設定", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Fixed Navbar", exact: true })
    .click();
  await page.getByRole("button", { name: "+A 放大字體", exact: true }).click();
  await scan(page, "settings-1280", true);
  await page.keyboard.press("Escape");
  await page.reload();
  assert.equal(
    await page
      .locator(".portal-navbar")
      .evaluate((el) => getComputedStyle(el).position),
    "sticky",
  );
  assert.equal(
    await page.locator(".affairs-portal").getAttribute("style"),
    "--portal-font-size: 15px;",
  );
  await page
    .getByRole("button", { name: "Welcome, student.qa@gmail.com 帳號選單", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "個人使用者通知查詢", exact: true })
    .click();
  await page.waitForURL("**/school-affairs/notifications");
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, label] of [
      ["", "home"],
      ["/menu/aca/all", "academic"],
      ["/menu/menu/common", "common"],
    ]) {
      await page.goto(base + "/school-affairs" + path);
      await page.locator(".portal-content").waitFor();
      if (label === "academic") {
        const widths = await page
          .locator(".portal-program-table tr")
          .first()
          .locator("th")
          .evaluateAll((nodes) =>
            nodes.map((node) => Math.round(node.getBoundingClientRect().width)),
          );
        assert.deepEqual(
          widths,
          width < 768 ? [63, 88] : [96, 132],
          "Source table column geometry",
        );
      }
      await scan(page, `${label}-${width}`, width === 1280 || width === 390);
    }
    if (width < 768) {
      await page.goto(base + "/school-affairs");
      await page
        .getByRole("button", { name: "開啟校務選單", exact: true })
        .click();
      await scan(page, `mobile-menu-${width}`, true);
      await page.keyboard.press("Escape");
      assert.ok(
        await page
          .getByRole("button", { name: "開啟校務選單", exact: true })
          .evaluate((el) => el === document.activeElement),
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  for (const skin of ["blue", "dark", "pink", "light"]) {
    await page.goto(base + "/school-affairs");
    await page.getByRole("button", { name: "介面設定", exact: true }).click();
    await page
      .getByRole("button", { name: skin + " skin", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await scan(page, `skin-${skin}-390`);
  }
  await page.goto(base + "/ePortal/apMenu.asp?temporary-state=discard");
  if(new URL(page.url()).pathname==='/ePortal/apMenu.asp')
    assert.ok((await page.locator('body').innerText()).length>100,'copied ePortal menu must render');
  else await page.waitForURL(base + "/school-affairs/search");
  await page.goto(base + "/ePortal/index.asp");
  if(new URL(page.url()).pathname==='/ePortal/index.asp')
    assert.ok((await page.locator('body').innerText()).length>100,'copied ePortal index must render');
  else await page.waitForURL(base + "/school-affairs");
  await page.goto(base + "/school-affairs");
  await page.locator(".portal-content").waitFor();
  await page.getByRole("link", { name: "知識庫管理", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  await context.close();
  const blocked = await browser.newContext({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  await wire(blocked);
  await mockAffairsAuth(blocked);
  await blocked.addInitScript(() => {
    const getItem=Storage.prototype.getItem;
    const setItem=Storage.prototype.setItem;
    Storage.prototype.getItem=function(key) { if(key.startsWith('stu.affairs.preview.'))throw Error('Preference storage disabled');return getItem.call(this,key); };
    Storage.prototype.setItem=function(key,value) { if(key.startsWith('stu.affairs.preview.'))throw Error('Preference storage disabled');return setItem.call(this,key,value); };
  });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(base + "/school-affairs");
  await blockedPage
    .getByRole("alert")
    .filter({ hasText: "瀏覽器無法儲存設定" })
    .waitFor();
  await blockedPage
    .getByRole("button", { name: "開啟校務選單", exact: true })
    .click();
  await blockedPage.keyboard.press("Escape");
  await blocked.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    JSON.stringify({
      status: "ok",
      menuViews: 25,
      programLinks: 94,
      states: evidence.length,
      externalRequests: 0,
      credentialForms: 0,
    }),
  );
} finally {
  await writeFile(
    `${directory}/results.json`,
    JSON.stringify({ evidence, errors, externalRequests }, null, 2),
  );
  await browser.close();
}
