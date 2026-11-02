import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = "http://127.0.0.1:8766",
  data = JSON.parse(
    await readFile("artifacts/tutorials/exports/chapters.json"),
  );
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage(),
  errors = [],
  media = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Start with your role." }).waitFor();
  const playlist = [
    { file: "00-complete-walkthrough.mp4", duration: data.seconds },
    ...data.chapters,
  ];
  for (const clip of playlist) {
    await page.locator("video").evaluate((v, file) => {
      v.pause();
      v.muted = true;
      v.src = file;
      document.querySelector("#captions").src = file.replace(".mp4", ".vtt");
      v.load();
    }, clip.file);
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return v.readyState >= 2 && Number.isFinite(v.duration);
      },
      {},
      { timeout: 30000 },
    );
    const duration = await page.locator("video").evaluate((v) => v.duration);
    assert.ok(Math.abs(duration - clip.duration) < 0.2);
    await page.locator("video").evaluate((v) => {
      v.textTracks[0].mode = "hidden";
      v.currentTime = 2;
    });
    await page.waitForFunction(
      () => document.querySelector("track").readyState === 2,
      {},
      { timeout: 15000 },
    );
    assert.equal(await page.locator("video").evaluate((v) => v.error), null);
    media.push({ file: clip.file, duration, captionTrack: true, loaded: true });
  }
  for (const file of [
    "STU-Nexus-Video-Guides.zip",
    "STU-Nexus-Editable-Media.zip",
  ]) {
    const r = await fetch(base + "/" + file, { method: "HEAD" });
    assert.equal(r.status, 200);
    assert.ok(Number(r.headers.get("content-length")) > 10000);
  }
  assert.equal((await fetch(base + "/.env.elevenlabs.local")).status, 404);
  await page
    .getByRole("button", { name: "Watch", exact: true })
    .first()
    .click();
  await page.waitForFunction(() =>
    document.querySelector("video").src.endsWith("02-teacher-workflow.mp4"),
  );
  await page.locator("video").evaluate((v) => v.pause());
  const findings = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const a = await new AxeBuilder({ page }).analyze();
    const severe = a.violations.filter((x) =>
      ["serious", "critical"].includes(x.impact),
    );
    assert.equal(severe.length, 0, JSON.stringify(severe.map((x) => x.id)));
    findings.push({ width, seriousCritical: 0, overflow: false });
    await page.screenshot({
      path: `artifacts/tutorials/qc/gallery-${width}.png`,
      fullPage: true,
    });
  }
  assert.equal(errors.length, 0);
  await writeFile(
    "artifacts/tutorials/qc/gallery-verification.json",
    JSON.stringify(
      {
        passed: true,
        media,
        viewports: findings,
        pageErrors: errors,
        archives: 2,
        privateEnvironmentExposure: false,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      media: media.length,
      viewports: 2,
      archives: 2,
      errors: 0,
    }),
  );
} finally {
  await browser.close();
}
