import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { affairsTestUser, mockAffairsAuth } from "./helpers/affairs-auth.mjs";
import {schoolServiceRouteInventory, summarizeServiceRoutes, expectedFinalServiceUrl, schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
const base = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5176";
const origin = new URL(base);
if (origin.protocol!=="http:" || !["127.0.0.1", "localhost"].includes(origin.hostname)
  || origin.origin!==base || origin.username || origin.password)
  throw Error("This portal preview suite is local-only.");
const inventoryOnly=process.argv.includes('--inventory-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--inventory-only'),'Unknown UI test option.');
const directory = `artifacts/stu-reference/affairs-qa/${inventoryOnly?'inventory':'full'}-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`;
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
const unexpectedApiRequests = [];
const apiReads = [];
const routeResults = [];
const inventorySummary = summarizeServiceRoutes();
let outcome='running',failure=null;
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
  await context.route("**/*", async (route) => {
    const request=route.request(),url = new URL(request.url());
    if (url.origin!==base) {
      externalRequests.push(url.origin + url.pathname);
      return route.abort();
    }
    if(url.pathname.startsWith('/api/')) {
      try {
        assert.match(request.headers().authorization||'',/^Bearer /,'Account reads require the synthetic caller token.');
        const json=schoolServiceReadFixture(url.href,request.method(),affairsTestUser,base);
        apiReads.push(url.pathname+url.search);
        return route.fulfill({json});
      } catch {
        unexpectedApiRequests.push({method:request.method(),path:url.pathname,query:url.search});
        return route.fulfill({status:503,json:{error:'This read is not included in the menu QA fixture contract.'}});
      }
    }
    if(request.method()!=='GET'){unexpectedApiRequests.push({method:request.method(),path:url.pathname});return route.abort();}
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
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
    serviceWorkers: "block",
  });
  await wire(context);
  const page = await context.newPage();
  await mockAffairsAuth(context);
  if(!inventoryOnly) {
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
  const catalogPaths = await page.locator(".portal-content [data-program-id]").evaluateAll(
    links => links.map(link => link.getAttribute("href")),
  );
  assert.ok(catalogPaths.every(path => path?.startsWith("/") && !path.startsWith("//")));
  await page.goto(base + "/school-affairs/menu/sao/all");
  assert.equal(await page.getByRole("link", {name:"請假填單", exact:true}).getAttribute("href"), "/school-affairs/services/leave");
  assert.equal(await page.getByRole("link", {name:"學生請假紀錄查詢", exact:true}).getAttribute("href"), "/school-affairs/services/leave/history");
  await page.goto(base + "/school-affairs/search");
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
  assert.deepEqual(await page.locator(".portal-widget h2").evaluateAll(
    (nodes) => nodes.map((heading) => heading.childNodes[1].textContent.trim()),
  ), ["系統作業通知", "最新通知", "最新消息", "常用選單", "疫情資訊"]);
  assert.equal(await page.locator(".reference-preview-notice, .portal-account-records").count(), 0);
  assert.equal(await page.locator(".portal-navbar").evaluate((el) => el.getBoundingClientRect().height), 45);
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
  await page.waitForURL(base + "/school-affairs/search");
  await page.locator("#portal-program-search").waitFor();
  await page.goto(base + "/ePortal/index.asp");
  await page.waitForURL(base + "/school-affairs");
  await page.locator(".portal-content").waitFor();
  await page.locator(".portal-user").click();
  await page.getByRole("menuitem", { name: "知識庫管理", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + "/school-affairs/menu/sao/all");
  await page.getByRole("link", { name: "請假填單", exact: true }).click();
  await page.waitForURL("**/school-affairs/services/leave");
  await page.getByLabel("開始請假日期", { exact: true }).waitFor();
  await page.getByRole("radio", { name: "心理假", exact: true }).check();
  assert.equal(await page.getByRole("radio", { name: "上午(08-13時)", exact: true }).isEnabled(), true);
  await page.getByRole("radio", { name: "事假", exact: true }).check();
  await page.getByRole("radio", { name: "上午(08-13時)", exact: true }).waitFor({ state: "detached" });
  await page.getByLabel("開始請假日期", { exact: true }).fill("2026-11-10");
  await page.getByLabel("結束請假日期", { exact: true }).fill("2026-11-10");
  assert.equal(await page.getByLabel("請假節次", { exact: true }).inputValue(), "週二09:00");
  await page.getByRole("button", { name: "全選", exact: true }).click();
  assert.ok(await page.getByRole("checkbox", { name: /Campus Orientation/ }).isChecked());
  await scan(page, "leave-form-1280", true);
  await page.setViewportSize({ width: 390, height: 850 });
  await scan(page, "leave-form-390", true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "回列表", exact: true }).click();
  await page.waitForURL("**/school-affairs/services/leave/history");
  await page.getByRole("columnheader", { name: "請假單號", exact: true }).waitFor();
  await page.goto(base + "/school-affairs/menu/aca/query");
  await page.getByRole("link", { name: "成績查詢", exact: true }).click();
  await page.waitForURL("**/school-affairs/services/13-1");
  await page.locator('.academic-grade-index-table').waitFor();
  assert.equal(await page.getByRole("cell", { name: "Sample quiz", exact: true }).count(),0,'Academic grade index does not reuse Moodle/enrollment grades.');
  await page.goto(base + "/school-affairs/menu/sao/query");
  await page.getByRole("link", { name: "待繳費用查詢", exact: true }).click();
  await page.waitForURL("**/school-affairs/services/39-1");
  await page.getByRole("cell", { name: /9,000/ }).waitFor();
  await page.goto(base + "/school-affairs/menu/rdd/input");
  await page.getByRole("link", { name: "實習紀錄輸入", exact: true }).click();
  await page.getByRole("heading", { name: "Student Zone", exact: true }).waitFor();
  await scan(page, "internship-index-1280", true);
  await page.getByRole("link", { name: "Internship contract", exact: true }).click();
  await page.getByRole("button", { name: /New record/ }).waitFor();
  await page.setViewportSize({ width: 390, height: 850 });
  await scan(page, "internship-contract-390", true);
  }
  await page.setViewportSize({width:1280,height:900});
  await page.goto(base + "/school-affairs/search");
  await page.locator("#portal-program-search").waitFor();
  const destinations = await page.locator(".portal-content a[data-program-id]").evaluateAll(links =>
    links.map(link => ({ id: link.dataset.programId, url: link.href })),
  );
  assert.equal(destinations.length, 94);
  assert.equal(new Set(destinations.map(row=>row.id)).size,94,'Each catalog entry appears once.');
  assert.deepEqual(destinations.map(row=>row.id).sort(),schoolServiceRouteInventory.map(row=>row.id).sort());
  for (const destination of destinations) {
    const entry=schoolServiceRouteInventory.find(row=>row.id===destination.id);
    const result={...entry,navigation:'pending'};
    try {
      assert.equal(destination.url,new URL(entry.href,base).href,'Exact origin, path, query and hash.');
      const link=page.locator(`.portal-content a[data-program-id="${entry.id}"]`);await link.waitFor();
      assert.equal(await link.getAttribute('href'),entry.href);
      await link.click();
      await page.waitForURL(expectedFinalServiceUrl(entry,destination.url,base),{timeout:8000});
      await page.locator(entry.selector).waitFor({timeout:8000});
      await page.waitForLoadState('networkidle',{timeout:8000});
      assert.equal(await page.locator(entry.selector).count(),1,'Unique route-specific root.');
      assert.equal(await page.getByRole('heading',{name:/Service not found|Page not copied yet|Copied page available/}).count(),0);
      assert.equal(await page.getByRole('alert').count(),0,'Loaded destination must not hide a fixture/read failure.');
      if(entry.heading)assert.equal(await page.locator(entry.selector).textContent(),entry.heading);
      if(entry.kind==='generic') {
        assert.equal(await page.locator('.student-service-title h1').textContent(),entry.title);
        assert.match(await page.locator('.student-service-body').innerText(),/Track your next steps here/);
      } else if(entry.kind!=='partial')assert.equal(await page.locator('.student-service-body').count(),0,'Dedicated destination must not fall back to the generic tracker.');
      if(entry.kind==='preview')assert.equal(await page.locator('.student-sso-preview fieldset:disabled').count(),1);
      if(entry.id==='4-4')assert.equal(await page.locator('a[href$=".pdf"]').count(),6,'Actual calendar document, not SPA fallback.');
      result.navigation='passed';
    } catch(error) {
      result.navigation='failed';result.error=error instanceof Error?error.message:'Navigation assertion failed';
      await page.screenshot({path:`${directory}/route-${entry.id}-failure.png`,fullPage:false}).catch(()=>{});
    }
    routeResults.push(result);
    await page.goBack();
    await page.locator('#portal-program-search').waitFor();
  }
  // Previously shared numeric links and the observed source redirect retain URL context.
  for(const [id,path] of [['20-1','leave'],['33-1','leave/history'],['53-1','internship'],['6-6','11-1']]) {
    await page.goto(base+`/school-affairs/services/${id}?qa=space%20value&second=1#menu-context`);
    await page.waitForURL(base+`/school-affairs/services/${path}?qa=space%20value&second=1#menu-context`);
  }
  assert.deepEqual(routeResults.filter(row=>row.navigation==='failed').map(({id,kind,error})=>({id,kind,error})),[],'Catalog navigation failures; generic gaps remain gaps even when navigation passes.');
  await context.close();
  if(!inventoryOnly) {
  const blocked = await browser.newContext({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
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
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(unexpectedApiRequests,[]);
  outcome='passed';
  console.log(
    JSON.stringify({
      status: "navigation-passed",
      menuViews: inventoryOnly?0:25,
      programLinks: 94,
      checkedDestinations: destinations.length,
      states: evidence.length,
      externalRequests: 0,
      credentialForms: 0,
      inventory: inventorySummary,
    }),
  );
} catch(error) {
  outcome='failed';failure=error instanceof Error?error.message:'Menu QA failed';throw error;
} finally {
  await browser.close();
  await writeFile(
    `${directory}/results.json`,
    JSON.stringify({status:outcome,failure,mode:inventoryOnly?'inventory-only':'full',evidence, errors, externalRequests,unexpectedApiRequests,apiReads,inventory:inventorySummary,routes:routeResults }, null, 2),
  );
  console.log('Menu QA evidence: '+directory+'/results.json');
}
