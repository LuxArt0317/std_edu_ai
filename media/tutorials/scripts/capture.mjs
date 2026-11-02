import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { clientForRole } from "../../../tests/helpers/role-client.mjs";
const state = JSON.parse(
    await readFile("artifacts/tutorials/private-state.json"),
  ),
  content = JSON.parse(await readFile("media/tutorials/content.json")),
  dir = resolve("artifacts/tutorials/assets/footage"),
  rawDir = resolve("artifacts/tutorials/raw");
await mkdir(dir, { recursive: true });
await mkdir(rawDir, { recursive: true });
let captures = {};
try {
  captures = JSON.parse(await readFile("artifacts/tutorials/captures.json"));
} catch {}
const b = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
let pauseWindow = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function click(p, l) {
  l = l.first();
  await l.scrollIntoViewIfNeeded();
  const box = await l.boundingBox();
  if (!box) throw Error("Target has no visible bounds");
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 14,
  });
  await sleep(350);
  await l.click();
  await sleep(850);
}
async function nav(p, name) {
  await click(
    p,
    p
      .getByRole("navigation", { name: "School navigation" })
      .getByRole("button", { name: new RegExp("^" + name + "(?:\\s*\\d+)?$") }),
  );
  await p.locator(".school-content h1").first().waitFor();
}
async function tab(p, name) {
  await click(
    p,
    p.getByRole("tab", { name: new RegExp("^" + name + "(?:\\s*\\d+)?$") }),
  );
}
async function calendar(p) {
  await nav(p, "Calendar");
  await click(p, p.getByRole("button", { name: /^agenda$/i }));
  await sleep(1000);
  const event = p.getByText("Digital skills workshop", { exact: true }).first();
  if (await event.count()) await click(p, event);
}
async function ask(p, role) {
  await click(p, p.getByRole("button", { name: "Assistant", exact: true }));
  await click(
    p,
    p.getByRole("button", { name: "Ask Answers only", exact: true }),
  );
  await p
    .getByLabel("Message", { exact: true })
    .fill(
      role === "student"
        ? "What is a useful next step for my Digital Skills course? Use available course information and do not change records."
        : "Summarize a useful next step for DEMO101 from available course information. Do not change any records.",
    );
  await sleep(900);
  await click(p, p.getByRole("button", { name: /^Send/ }));
  const sentAt = Date.now();
  await p
    .locator(".chat-messages .assistant:not(.thinking) p")
    .last()
    .waitFor({ timeout: 90000 });
  await p.waitForFunction(
    () => {
      const x = [
        ...document.querySelectorAll(
          ".chat-messages .assistant:not(.thinking) p",
        ),
      ].at(-1);
      return x && x.textContent.length > 40;
    },
    {},
    { timeout: 90000 },
  );
  pauseWindow = [sentAt + 1000, Date.now() - 700];
  await p
    .locator(".chat-messages .assistant:not(.thinking) p")
    .first()
    .evaluate((el) => {
      const view = el.closest(".chat-messages");
      if (view)
        view.scrollTop +=
          el.getBoundingClientRect().top -
          view.getBoundingClientRect().top -
          20;
    });
  await sleep(8000);
}
async function doShot(p, sc) {
  switch (sc.shot) {
    case "overview":
      await nav(p, "Courses");
      await click(
        p,
        p.getByRole("button", { name: "Collapse sidebar", exact: true }),
      );
      await sleep(1000);
      await click(
        p,
        p.getByRole("button", { name: "Expand sidebar", exact: true }),
      );
      break;
    case "courses":
      if (sc.role === "student") {
        await p
          .getByText("Lessons and materials", { exact: true })
          .scrollIntoViewIfNeeded();
        await sleep(1000);
      } else {
        await tab(p, "Curriculum");
        await tab(p, "Content");
      }
      break;
    case "content": {
      const card = p
        .locator(".lms-module-list > [data-slot=card]")
        .filter({ hasText: "Week 2 · Responsible AI" });
      await click(
        p,
        card.getByRole("button", { name: "Edit lesson", exact: true }),
      );
      await p.getByRole("dialog").waitFor();
      await p
        .getByRole("textbox", { name: "Title", exact: true })
        .fill("Verify an AI suggestion");
      await sleep(1000);
      await click(
        p,
        p.getByRole("button", { name: "Save material changes", exact: true }),
      );
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      break;
    }
    case "publish":
      await tab(p, "Student view");
      await sleep(1200);
      await tab(p, "Content");
      {
        const card = p
          .locator(".lms-module-list > [data-slot=card]")
          .filter({ hasText: "Week 2 · Responsible AI" });
        const pub = card.getByRole("button", { name: "Publish", exact: true });
        if (await pub.count()) await click(p, pub);
        const material = card.getByRole("button", {
          name: "Publish for students",
          exact: true,
        });
        if (await material.count()) await click(p, material);
      }
      await tab(p, "Student view");
      break;
    case "assessments":
      await tab(p, "Assessments");
      await click(
        p,
        p
          .locator("[data-slot=card]")
          .filter({
            has: p.getByRole("heading", {
              name: "Information and AI check",
              exact: true,
            }),
          })
          .getByRole("button", { name: "Edit assessment", exact: true }),
      );
      await p.getByRole("dialog").waitFor();
      await p
        .getByText("After-submission experience", { exact: true })
        .scrollIntoViewIfNeeded();
      await sleep(1500);
      await p.keyboard.press("Escape");
      await nav(p, "Assessments");
      await click(
        p,
        p
          .locator(".assessment-list > [data-slot=card]")
          .filter({ hasText: "Information and AI check" })
          .getByRole("button", { name: /Preview assessment/ }),
      );
      break;
    case "review":
      await tab(p, "Submissions");
      {
        const card = p
          .locator(".lms-submission-list > [data-slot=card]")
          .filter({ hasText: "Source-check reflection" });
        await click(
          p,
          card.getByRole("button", { name: /Grade work|pts · Edit/ }),
        );
        await p
          .getByRole("textbox", { name: "Feedback", exact: true })
          .fill(
            "Clear question and next action. Include the original source link in the next reflection.",
          );
        await p
          .getByRole("spinbutton", { name: "Score out of 20", exact: true })
          .fill("18");
        await click(
          p,
          p.getByRole("button", {
            name: "Save grade and feedback",
            exact: true,
          }),
        );
        await p.getByRole("dialog").waitFor({ state: "hidden" });
      }
      break;
    case "announcement":
      await tab(p, "Announcements");
      await click(
        p,
        p.getByRole("button", { name: "+ Announcement", exact: true }),
      );
      {
        const d = p.getByRole("dialog");
        await d
          .getByRole("textbox", { name: "Title", exact: true })
          .fill("Workshop reminder (Demo)");
        await d
          .locator("[contenteditable=true]")
          .fill(
            "Before our next workshop, read the source-check lesson and bring one question about your reflection.",
          );
        await click(
          p,
          p.getByRole("button", { name: "Publish announcement", exact: true }),
        );
        await d.waitFor({ state: "hidden" });
      }
      break;
    case "assignment":
      {
        const card = p
          .locator(".lms-student-assignments [data-slot=card]")
          .filter({ hasText: "Plan your next step" });
        await card.scrollIntoViewIfNeeded();
        await click(
          p,
          card.getByRole("button", { name: /Submit work|View \/ resubmit/ }),
        );
        await p
          .getByRole("textbox", { name: "Written response", exact: true })
          .fill(
            "Before the workshop, I will read the source-check lesson and verify the original course source. I will write one specific question to discuss with my teacher.",
          );
        await click(
          p,
          p.getByRole("button", { name: "Submit assignment", exact: true }),
        );
        await p.getByRole("dialog").waitFor({ state: "hidden" });
      }
      break;
    case "scan":
      await p
        .getByLabel(/Grade item/)
        .selectOption({ label: "DEMO101 · Week 1 reflection (20)" });
      await p
        .getByLabel("Grade sheet image", { exact: true })
        .setInputFiles(resolve("artifacts/tutorials/grade-sheet.png"));
      await p.locator(".scan-review").waitFor({ timeout: 70000 });
      await p.locator(".scan-review").scrollIntoViewIfNeeded();
      await sleep(1800);
      await click(
        p,
        p.getByRole("button", { name: /Approve reviewed drafts/ }),
      );
      await p.locator(".scan-review").waitFor({ state: "hidden" });
      await click(p, p.getByRole("button", { name: "Publish", exact: true }));
      await p
        .getByRole("textbox", { name: "Publication reason", exact: true })
        .fill(
          "Reviewed the synthetic demonstration grade and matched the correct learner and grade item.",
        );
      await click(
        p,
        p.getByRole("button", { name: "Publish final grade", exact: true }),
      );
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      break;
    case "attendance":
      await tab(p, "Attendance");
      await click(p, p.getByRole("button", { name: "Open roll", exact: true }));
      await p.getByRole("dialog").waitFor();
      await click(
        p,
        p.getByRole("button", { name: "Save complete roll", exact: true }),
      );
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      await tab(p, "Submissions");
      await calendar(p);
      break;
    case "assistant":
      await ask(p, sc.role);
      break;
    case "lesson":
      await p
        .getByText("Lessons and materials", { exact: true })
        .scrollIntoViewIfNeeded();
      await click(
        p,
        p.getByRole("button", { name: /Make a clear next step/ }).first(),
      );
      await click(p, p.getByRole("button", { name: "Next →", exact: true }));
      await click(p, p.getByRole("button", { name: /Mark complete/ }));
      break;
    case "quiz":
      await click(
        p,
        p
          .locator(".assessment-list > [data-slot=card]")
          .filter({ hasText: "Information and AI check" })
          .getByRole("button", { name: /Start assessment/ }),
      );
      await click(p, p.getByRole("button", { name: /I understand/ }));
      {
        const fields = p.locator(".quiz-panel fieldset");
        await fields.first().waitFor();
        for (let i = 0; i < (await fields.count()); i++) {
          await click(p, fields.nth(i).getByRole("radio").first());
        }
      }
      await click(p, p.getByRole("button", { name: /Submit and check/ }));
      await p.locator(".quiz-result").waitFor({ timeout: 30000 });
      break;
    case "grades":
      await sleep(1500);
      {
        const f = p.getByText("Clear reasoning.", { exact: false }).first();
        if (await f.count()) await f.scrollIntoViewIfNeeded();
      }
      break;
    case "calendar":
      await click(p, p.getByRole("button", { name: /^agenda$/i }));
      await sleep(1000);
      {
        const e = p
          .getByText("Digital skills workshop", { exact: true })
          .first();
        if (await e.count()) await click(p, e);
      }
      break;
    case "notifications":
      await click(
        p,
        p.getByRole("button", { name: "Notifications", exact: true }),
      );
      await p
        .getByRole("dialog", { name: "Notifications", exact: true })
        .waitFor();
      await p
        .getByRole("textbox", { name: "Subject", exact: true })
        .fill("Question about my reflection feedback");
      await p
        .getByRole("textbox", { name: "Message", exact: true })
        .fill(
          "Could you explain how I can improve the source link in my next reflection?",
        );
      break;
    case "curriculum":
      await tab(p, "Curriculum");
      {
        const x = p.getByRole("button", { name: /DEMO-BS/ }).first();
        if (await x.count()) await click(p, x);
      }
      break;
    case "enrollment":
      await tab(p, "Classes");
      {
        const x = p
          .getByText("Digital Skills for Everyday Work", { exact: true })
          .first();
        if (await x.count()) await x.scrollIntoViewIfNeeded();
      }
      await sleep(900);
      await tab(p, "Enrollment");
      {
        const x = p.getByRole("button", { name: /DEMO101/ }).first();
        if (await x.count()) await click(p, x);
      }
      break;
    case "requests":
      await tab(p, "Change requests");
      await p
        .getByText("Add a source-checking practice task (Demo)", {
          exact: true,
        })
        .first()
        .scrollIntoViewIfNeeded();
      break;
    case "student": {
      const row = p
        .locator(".intervention-row")
        .filter({ hasText: "Alex Rivera (Demo)" });
      await row.scrollIntoViewIfNeeded();
      await click(p, row.getByRole("button", { name: "Open", exact: true }));
      await p.getByRole("dialog").waitFor();
      await p.locator(".student-drawer").evaluate((el) => (el.scrollTop = 200));
      break;
    }
    case "plan": {
      const row = p
        .locator(".intervention-row")
        .filter({ hasText: "Alex Rivera (Demo)" });
      await click(p, row.getByRole("button", { name: /Plan/ }));
      await p
        .getByLabel("Request", { exact: true })
        .fill(
          "Create a brief supportive plan for this demonstration context. Recommend a human check-in; do not change records.",
        );
      await click(
        p,
        p.getByRole("button", { name: "Draft plan", exact: true }),
      );
      await p
        .getByText("OpenAI · grounded", { exact: true })
        .waitFor({ timeout: 60000 });
      break;
    }
    case "cases":
      await click(
        p,
        p.getByRole("button", { name: "+ Create case", exact: true }),
      );
      {
        const d = p.getByRole("dialog");
        await d
          .getByRole("combobox", { name: "Student", exact: true })
          .selectOption(state.ids.student);
        await d
          .getByRole("combobox", { name: "Assigned to" })
          .selectOption(state.users.support.id);
        await d
          .getByRole("textbox", { name: "Title", exact: true })
          .fill("Registration question — demonstration follow-up");
        await d
          .locator("[contenteditable=true]")
          .fill(
            "Review the learner’s registration question and agree on one clear next step. Synthetic tutorial record.",
          );
        await sleep(900);
        await click(
          p,
          d.getByRole("button", { name: "Save changes", exact: true }),
        );
        await d.waitFor({ state: "hidden" });
      }
      break;
    case "admissions":
      await click(
        p,
        p.getByRole("button", { name: "+ Add prospect", exact: true }),
      );
      await p.getByRole("dialog").waitFor();
      await sleep(1300);
      await p.keyboard.press("Escape");
      break;
    case "messages":
      {
        const x = p.getByRole("button", { name: /Draft with/ }).first();
        if (await x.count()) {
          await click(p, x);
          await p
            .getByLabel("Request", { exact: true })
            .fill(
              "Draft a short, supportive registration reminder. Do not send or change any records.",
            );
          await sleep(1400);
        }
      }
      break;
    case "reports":
      {
        const x = p.getByText("Workload", { exact: true });
        if (await x.count()) {
          await click(p, x);
          await p.locator(".workload-evidence").scrollIntoViewIfNeeded();
        }
      }
      break;
    case "knowledge": {
      const x = p.getByRole("button", { name: /Add article/ }).first();
      if (await x.count()) {
        await click(p, x);
        await p.getByRole("dialog").waitFor();
        await sleep(1300);
        await p.keyboard.press("Escape");
      }
      await p.locator(".governed-knowledge").scrollIntoViewIfNeeded();
      break;
    }
    case "users":
      await p
        .getByRole("textbox", { name: "Search accounts", exact: true })
        .fill("Demo");
      await sleep(1300);
      {
        const x = p.getByText("Role settings", { exact: true });
        if (await x.count()) await click(p, x);
      }
      break;
    case "preview":
      await click(p, p.getByRole("button", { name: /^Account menu/ }));
      await click(
        p,
        p.getByRole("menuitem", { name: "Preview role", exact: true }),
      );
      await click(
        p,
        p.getByRole("menuitemradio", { name: "Student", exact: true }),
      );
      await p.keyboard.press("Escape");
      await p.keyboard.press("Escape");
      await p
        .getByText("Actions still use owner access.", { exact: false })
        .waitFor();
      break;
    default:
      await sleep(2500);
  }
  await sleep(1500);
}
function routeFor(sc) {
  if (
    [
      "courses",
      "content",
      "publish",
      "attendance",
      "lesson",
      "review",
      "announcement",
      "assignment",
    ].includes(sc.shot) ||
    sc.shot === "assistant"
  )
    return "courses";
  return (
    {
      overview: "",
      assessments: "courses",
      scan: "grades",
      quiz: "assessments",
      grades: "grades",
      calendar: "calendar",
      notifications: "",
      curriculum: "academics",
      enrollment: "academics",
      requests: "academics",
      student: "alerts",
      plan: "alerts",
      cases: "cases",
      admissions: "admissions",
      messages: "messages",
      reports: "reports",
      knowledge: "knowledge",
      users: "users",
      preview: "",
    }[sc.shot] || ""
  );
}
try {
  const g = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await g.setContent(
    '<html><body style="font-family:Arial;padding:70px;background:#fff;color:#182c25"><p style="letter-spacing:3px;color:#177961">SYNTHETIC TRAINING RECORD · DEMO101</p><h1 style="font-size:44px">Week 1 reflection</h1><p>Grade sheet for the tutorial demonstration only. Maximum score: 20.</p><table style="border-collapse:collapse;width:100%;margin-top:70px;font-size:27px"><tr style="background:#e4f2eb"><th style="padding:30px;text-align:left">Student number</th><th style="text-align:left">Student name</th><th>Score</th></tr><tr><td style="padding:40px 30px;border-bottom:1px solid #ddd">DEMO-001</td><td style="border-bottom:1px solid #ddd">Alex Rivera (Demo)</td><td style="text-align:center;border-bottom:1px solid #ddd">18 / 20</td></tr></table><p style="margin-top:70px">Review and match the learner before saving. This is not an official academic record.</p></body></html>',
  );
  await g.screenshot({ path: "artifacts/tutorials/grade-sheet.png" });
  await g.close();
  for (const ep of content.episodes)
    for (const sc of ep.scenes) {
      if (sc.kind === "graphic") continue;
      if (process.env.SCENE && !process.env.SCENE.split(",").includes(sc.id))
        continue;
      if (captures[sc.id]?.complete) {
        try {
          await stat(resolve(dir, sc.id + ".mp4"));
          console.log(JSON.stringify({ scene: sc.id, cached: true }));
          continue;
        } catch {}
      }
      const client = await clientForRole(state, sc.role),
        session = (await client.auth.getSession()).data.session;
      if (!session) throw Error("Missing authenticated role session");
      state.users[sc.role].session = session;
      await writeFile(
        "artifacts/tutorials/private-state.json",
        JSON.stringify(state),
        { mode: 0o600 },
      );
      const c = await b.newContext({
        viewport: { width: 1600, height: 900 },
        recordVideo: { dir: rawDir, size: { width: 1600, height: 900 } },
        timezoneId: "Asia/Manila",
        reducedMotion: "reduce",
      });
      await c.addInitScript((s) => {
        localStorage.setItem("stu-nexus-auth", JSON.stringify(s));
        localStorage.setItem("theme", "light");
      }, session);
      const p = await c.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      try {
        await p.goto(`https://stdeduai.vercel.app/app/${routeFor(sc)}`);
        await p
          .locator(".school-content h1")
          .first()
          .waitFor({ timeout: 45000 });
        if (
          sc.role === "faculty" &&
          [
            "courses",
            "content",
            "publish",
            "attendance",
            "assessments",
            "assistant",
            "review",
            "announcement",
          ].includes(sc.shot)
        )
          await p
            .getByRole("combobox", { name: "Assigned class", exact: true })
            .selectOption(state.ids.section);
        await p.addStyleTag({
          content:
            '[data-slot="dropdown-menu-label"]{visibility:hidden} html{scroll-behavior:smooth!important}',
        });
        await p.evaluate(() => {
          const cursor = document.createElement("div");
          cursor.id = "tutorial-cursor";
          cursor.style.cssText =
            "position:fixed;z-index:2147483647;width:20px;height:20px;border:3px solid #14755d;border-radius:50%;background:#ffffffd9;box-shadow:0 1px 8px #0005;pointer-events:none;left:-40px;top:-40px;transform:translate(-50%,-50%)";
          document.body.append(cursor);
          document.addEventListener("mousemove", (e) => {
            cursor.style.left = e.clientX + "px";
            cursor.style.top = e.clientY + "px";
          });
          document.addEventListener("mousedown", () =>
            cursor.animate(
              [
                { transform: "translate(-50%,-50%) scale(1)" },
                { transform: "translate(-50%,-50%) scale(1.8)", opacity: 0.4 },
                { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
              ],
              { duration: 380 },
            ),
          );
        });
        pauseWindow = null;
        const start = Date.now();
        await sleep(700);
        await doShot(p, sc);
        if (Date.now() - start < 8500) await sleep(8500 - (Date.now() - start));
        await p.screenshot({ path: `artifacts/tutorials/${sc.id}-end.png` });
        const end = Date.now(),
          video = p.video();
        await c.close();
        const raw = await video.path(),
          rawDuration = Number(
            execFileSync(
              "ffprobe",
              [
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
                raw,
              ],
              { encoding: "utf8" },
            ),
          ),
          duration = (end - start) / 1000,
          from = Math.max(0, rawDuration - duration);
        captures[sc.id] = {
          role: sc.role,
          shot: sc.shot,
          raw: "raw/" + basename(raw),
          from,
          duration,
          complete: true,
          appErrors: errors,
          synthetic: true,
        };
        await writeFile(
          "artifacts/tutorials/captures.json",
          JSON.stringify(captures, null, 2),
        );
        const wait =
          pauseWindow && pauseWindow[1] - pauseWindow[0] > 2000
            ? pauseWindow
            : null;
        const videoArgs = wait
          ? [
              "-i",
              raw,
              "-filter_complex",
              `[0:v]trim=start=${from}:end=${from + (wait[0] - start) / 1000},setpts=PTS-STARTPTS[a];[0:v]trim=start=${from + (wait[1] - start) / 1000}:end=${from + duration},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,fps=30,format=yuv420p[v]`,
              "-map",
              "[v]",
            ]
          : [
              "-ss",
              String(from),
              "-i",
              raw,
              "-t",
              String(duration),
              "-vf",
              "fps=30,format=yuv420p",
            ];
        execFileSync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            ...videoArgs,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "19",
            resolve(dir, sc.id + ".mp4"),
          ],
          { stdio: "pipe" },
        );
        if (wait) {
          captures[sc.id].removedWaitSeconds = (wait[1] - wait[0]) / 1000;
          captures[sc.id].duration =
            duration - captures[sc.id].removedWaitSeconds;
          await writeFile(
            "artifacts/tutorials/captures.json",
            JSON.stringify(captures, null, 2),
          );
        }
        console.log(
          JSON.stringify({
            scene: sc.id,
            role: sc.role,
            seconds: duration,
            errors,
          }),
        );
        if (errors.length) throw Error("App errors in recorded scene");
      } catch (e) {
        await p
          .screenshot({ path: `artifacts/tutorials/${sc.id}-failure.png` })
          .catch(() => {});
        await writeFile(
          `artifacts/tutorials/${sc.id}-failure.txt`,
          await p
            .locator("body")
            .innerText()
            .catch(() => ""),
        );
        await c.close().catch(() => {});
        throw Error(`${sc.id}: ${e.message}`);
      }
    }
} finally {
  await b.close();
}
