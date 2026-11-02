import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { load } from "cheerio";
const base = process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Local-only UI verification");
const capturedPages = JSON.parse(
  await (
    await import("node:fs/promises")
  ).readFile("src/features/public/mirror/pages.json", "utf8"),
);
const pageTitle = (source) =>
  capturedPages.find((p) => p.source === source)?.title;
const routes = (
  process.env.MIRROR_ROUTES ||
  "/|/在校學生/|/admissions|/freshman|/教職員工/|/進修人士/|/畢業校友/|/alumni-association|/校外訪客/|/國際學生/|/international|/freshman?p=605|/school-sites/www.oica.stu.edu.tw/en/work-permit-application/|/school-sites/alumnus.sao.stu.edu.tw/star/detail/1"
).split("|");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const evidence = [],
  problems = [];
await mkdir("artifacts/site-mirror/qa", { recursive: true });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" }),
    page = await context.newPage(),
    errors = [],
    foreign = [];
  const auditContext = await browser.newContext({
      reducedMotion: "reduce",
      bypassCSP: true,
    }),
    audit = await auditContext.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  audit.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    try {
      if (
        r.frame().parentFrame() &&
        /^https?:/.test(r.url()) &&
        new URL(r.url()).origin !== new URL(base).origin
      )
        foreign.push(r.url());
    } catch {}
  });
  async function ready() {
    await page.locator(".source-mirror iframe").waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector("iframe")?.contentDocument?.documentElement
          .dataset.mirrorReady === "true",
    );
    return page.frameLocator(".source-mirror iframe");
  }
  for (const width of (process.env.MIRROR_WIDTHS || "1440,768,390,320")
    .split(",")
    .map(Number)) {
    await page.setViewportSize({ width, height: 900 });
    for (const [index, route] of routes.entries()) {
      await page.goto(base + route, { waitUntil: "domcontentloaded" });
      const frame = await ready();
      const state = await frame.locator("html").evaluate((e) => ({
        standards: e.ownerDocument.compatMode,
        width: e.clientWidth,
        scroll: e.scrollWidth,
        text: e.ownerDocument.body.textContent.length,
        placeholders: e.querySelectorAll('img[src^="data:image/gif"]').length,
      }));
      assert.equal(state.standards, "CSS1Compat", route);
      assert.ok(state.text > 100, route);
      if (state.scroll > state.width + 1)
        problems.push({ route, width, kind: "overflow", ...state });
      if (state.scroll > state.width + 1)
        console.log(
          JSON.stringify({
            route,
            width,
            offenders: await frame.locator("body *").evaluateAll((es) =>
              es
                .filter(
                  (e) =>
                    e.getBoundingClientRect().right >
                      document.documentElement.clientWidth + 0.25 &&
                    getComputedStyle(e).display !== "none",
                )
                .slice(0, 8)
                .map((e) => ({
                  tag: e.tagName,
                  cl: e.className,
                  w: e.getBoundingClientRect().width,
                  style: e.getAttribute("style"),
                  right: e.getBoundingClientRect().right,
                  margin: getComputedStyle(e).margin,
                  padding: getComputedStyle(e).padding,
                })),
            ),
          }),
        );
      let accessibility = [];
      if (width === 1440 || width === 390) {
        const html = await frame.locator("html").evaluate((e) => e.outerHTML),
          $ = load(html);
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        $("head").prepend('<base href="' + base + '/">');
        await audit.setViewportSize({ width, height: 900 });
        await audit.setContent("<!doctype html>" + $.html(), {
          waitUntil: "load",
        });
        const scan = await new AxeBuilder({ page: audit })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        accessibility = scan.violations
          .filter((v) => ["serious", "critical"].includes(v.impact))
          .map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          }));
      }
      evidence.push({ route, width, ...state, accessibility });
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: `artifacts/site-mirror/qa/page-${index}-${width}.png`,
        });
      console.log(
        JSON.stringify({
          route,
          width,
          overflow: state.scroll > state.width + 1,
          accessibility: accessibility.map((v) => v.id),
          placeholders: state.placeholders,
        }),
      );
    }
  }
  await writeFile(
    "artifacts/site-mirror/qa/states.json",
    JSON.stringify({ evidence, problems }, null, 2),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  let frame = await ready();
  await frame.getByRole("tab", { name: "ALL", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await frame
      .getByRole("tab", { name: "行政公告", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await frame.getByRole("tab", { name: "學生專區", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await frame
      .getByRole("tab", { name: "教師專區", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await frame
      .locator(".newsword--admin")
      .evaluate((e) => getComputedStyle(e).display !== "none"),
    true,
  );
  const next = frame
    .locator(".elementor-main-swiper")
    .first()
    .locator("..")
    .locator(".elementor-swiper-button-next");
  const before = await frame
    .locator(".elementor-main-swiper")
    .first()
    .locator(".swiper-slide[aria-hidden=false]")
    .getAttribute("data-swiper-slide-index");
  await next.click();
  const after = await frame
    .locator(".elementor-main-swiper")
    .first()
    .locator(".swiper-slide[aria-hidden=false]")
    .getAttribute("data-swiper-slide-index");
  assert.notEqual(after, before);
  await frame
    .getByRole("link", { name: /在校學生/ })
    .filter({ has: frame.locator("h3") })
    .first()
    .click();
  await page.waitForURL("**/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/");
  await page
    .getByRole("region", {
      name: pageTitle(
        "https://www.stu.edu.tw/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/",
      ),
      exact: true,
    })
    .waitFor();
  frame = await ready();
  await frame.getByRole("link", { name: "學生Gmail", exact: true }).click();
  await page.waitForURL("**/student-sso");
  assert.equal(await page.locator("form").count(), 0);
  for (const field of await page
    .locator(".sso-reference-card input,.sso-reference-card button")
    .all())
    assert.ok(await field.isDisabled());
  await page.goto(base + "/alumni-association");
  frame = await ready();
  await frame.getByRole("button", { name: "關於總會", exact: true }).click();
  await frame.getByRole("link", { name: "總會沿革", exact: true }).click();
  await page.waitForURL("**/school-sites/alumnus.sao.stu.edu.tw/about/evolve");
  await page
    .getByRole("region", {
      name: pageTitle("https://alumnus.sao.stu.edu.tw/about/evolve"),
      exact: true,
    })
    .waitFor();
  await ready();
  await page.goto(base + "/admissions");
  frame = await ready();
  await frame
    .getByRole("link", { name: "營區專班", exact: true })
    .first()
    .click();
  await page.waitForURL((u) =>
    u.pathname.startsWith("/school-sites/reg.aca.stu.edu.tw/"),
  );
  await page
    .getByRole("region", {
      name: pageTitle("https://reg.aca.stu.edu.tw/camp_st"),
      exact: true,
    })
    .waitFor();
  await ready();
  frame = await ready();
  await frame.locator('a[href$="?p=34423"]').first().click();
  await page.waitForURL("**/?p=34423");
  await page
    .getByRole("region", {
      name: pageTitle("https://reg.aca.stu.edu.tw/force_area"),
      exact: true,
    })
    .waitFor();
  await ready();
  await page.reload();
  await ready();
  await page.goBack();
  await ready();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base);
  frame = await ready();
  const toggle = frame.locator(".elementor-menu-toggle:visible").first();
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await toggle.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await page.goto(base + "/international");
  frame = await ready();
  const officeMenu = frame.locator("#simple-menu");
  if (await officeMenu.isVisible()) {
    await officeMenu.click();
    assert.equal(await officeMenu.getAttribute("aria-expanded"), "true");
    await officeMenu.press("Escape");
    assert.equal(await officeMenu.getAttribute("aria-expanded"), "false");
  }
  await page.goto(base + "/local-pages?q=招生");
  await page.getByRole("heading", { name: /Local school pages/ }).waitFor();
  assert.ok((await page.locator(".mirror-index li").count()) > 0);
  const delayed = await context.newPage();
  let releaseMedia;
  const mediaGate = new Promise(resolve => { releaseMedia = resolve; });
  let blockedMedia = 0;
  await delayed.route("**/school-assets/**", async route => {
    if (["image", "font"].includes(route.request().resourceType())) {
      blockedMedia++;
      await mediaGate;
    }
    await route.continue().catch(() => {});
  });
  try {
    await delayed.goto(base + "/在校學生/", { waitUntil: "domcontentloaded" });
    await delayed.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.documentElement.dataset.mirrorReady === "true");
    assert.ok(blockedMedia > 0, "Slow source media must remain pending during this regression check");
    await delayed.frameLocator("iframe").getByRole("link", { name: "學生Gmail", exact: true }).click();
    await delayed.waitForURL("**/student-sso");
    await delayed.locator(".source-mirror iframe").waitFor({ state: "detached" });
    assert.equal(await delayed.locator(".source-mirror iframe").count(), 0, "School navigation must leave the source frame");
  } finally {
    releaseMedia();
    await delayed.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(foreign, []);
  const summary = {
    evidence,
    problems,
    errors,
    foreign,
    interactions: {
      newsTabs: true,
      carousel: true,
      studentSso: true,
      alumniMenu: true,
      admissionsDetailAndHistory: true,
      mobileEscape: true,
      search: true,
      navigationBeforeMediaLoad: true,
    },
  };
  await writeFile(
    "artifacts/site-mirror/qa/ui.json",
    JSON.stringify(summary, null, 2),
  );
  const semanticFailures=evidence.flatMap(e=>e.accessibility.filter(v=>v.id!=='color-contrast').map(v=>({route:e.route,width:e.width,...v})));
  assert.deepEqual(semanticFailures,[],'Source semantics must remain accessible; original contrast findings are reported separately');
  assert.deepEqual(
    problems,
    [],
    "Captured pages must fit mobile and desktop viewports",
  );
  console.log(
    JSON.stringify({
      states: evidence.length,
      interactions: summary.interactions,
      sourceAccessibilityFindings: evidence.reduce(
        (n, e) => n + e.accessibility.length,
        0,
      ),
    }),
  );
  await auditContext.close();
  await context.close();
} finally {
  await browser.close();
}
