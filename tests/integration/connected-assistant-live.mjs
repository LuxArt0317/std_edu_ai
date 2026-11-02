import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import {
  createFixtures,
  cleanupFixtures,
  statePath,
} from "../e2e/client-fixtures.mjs";
import {
  clientResearchEnvironment,
  researchSession,
} from "../helpers/client-research-session.mjs";
const config = JSON.parse(await readFile("deployment.json", "utf8"));
await clientResearchEnvironment();
try {
  await stat(statePath);
  throw Error(
    "Another fixture run is active; finish it before live Assistant QA.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const results = [];
async function request(path, body, token) {
  const response = await fetch(config.vercel.productionUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    }),
    payload = await response.json();
  assert.equal(
    response.status,
    200,
    `${path}: ${payload.error || response.status}`,
  );
  return payload;
}
function record(name, details) {
  results.push({ name, ...details });
  console.log(JSON.stringify(results.at(-1)));
}
let faculty, announcement;
try {
  const state = await createFixtures();
  const student = await researchSession("student");
  faculty = await researchSession("faculty");
  const notice = await faculty.db
    .from("announcements")
    .insert({
      section_id: state.ids.section,
      author_id: faculty.user.id,
      title: `${state.marker} course notice`,
      body: "Bring the blue workbook to Room Q82.",
      audience_roles: ["student", "faculty"],
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert.equal(notice.error, null);
  announcement = notice.data.id;
  for (const [question, pattern] of [
    ["What is the contact number of the registrar?", /615.?8000/],
    ["Where is Shu-Te University located?", /Hengshan|橫山|Kaohsiung|高雄/i],
    ["學生可以在哪裡查詢課程？", /課程|選課/],
    ["Where do I find student email and TronClass?", /Gmail|google|TronClass/i],
  ]) {
    const result = await request("/api/research-assistant", { question });
    assert.equal(result.status, "answered");
    assert.match(result.answer, pattern);
    assert.ok(result.citations.length > 0);
    assert.ok(
      result.citations.every((c) => new URL(c.url).protocol === "https:"),
    );
    record("public grounded answer", {
      question,
      status: result.status,
      citations: result.citations.length,
    });
  }
  const publicPersonal = await request("/api/research-assistant", {
    question: "What are my current subjects?",
    context: { courses: [{ title: "FORGED PRIVATE SUBJECT" }] },
  });
  assert.equal(publicPersonal.status, "handoff");
  assert.match(publicPersonal.answer, /sign in/i);
  assert.doesNotMatch(publicPersonal.answer, /FORGED/);
  record("anonymous personal boundary", { status: "sign-in required" });
  for (const [role, session, question, pattern] of [
    [
      "student",
      student,
      "What are my current enrolled app subjects? Use my actual account records.",
      new RegExp(state.marker),
    ],
    [
      "faculty",
      faculty,
      "Which app class am I assigned to teach?",
      new RegExp(state.marker),
    ],
    [
      "student",
      student,
      "What does the latest announcement for my app class tell me to bring and where?",
      /blue workbook|Room Q82/i,
    ],
  ]) {
    const result = await request(
      "/api/school-assistant",
      {
        message: question,
        mode: "qa",
        history: [],
        context: {
          view: "home",
          courses: [{ title: "FORGED PRIVATE SUBJECT" }],
          announcements: [{ body: "FORGED NOTICE" }],
        },
      },
      session.session.access_token,
    );
    assert.equal(result.source, "openai");
    assert.equal(result.grounding.accountContext, "server-rls");
    assert.deepEqual(result.grounding.unavailable, []);
    assert.equal(result.proposedAction, null);
    assert.match(result.answer, pattern);
    assert.doesNotMatch(result.answer, /FORGED/);
    record("signed-in actual account answer", {
      role,
      topic: question,
      serverRls: true,
    });
  }
  const draftTitle = `${state.marker} proposed module`;
  const proposed = await request(
    "/api/school-assistant",
    {
      message: `Prepare one unpublished module titled ${draftTitle} for my assigned app class. Do not save it before confirmation.`,
      mode: "agentic",
      history: [],
      context: { view: "teaching" },
    },
    faculty.session.access_token,
  );
  assert.equal(proposed.proposedAction?.type, "create_module");
  assert.equal(proposed.proposedAction.sectionId, state.ids.section);
  assert.equal(proposed.proposedAction.publish, false);
  const unsaved = await faculty.db
    .from("learning_modules")
    .select("id")
    .eq("section_id", state.ids.section)
    .eq("title", draftTitle);
  assert.deepEqual(unsaved.data, []);
  record("teacher action remains a reviewable unsaved proposal", {
    type: proposed.proposedAction.type,
  });
  const forbidden = await request(
    "/api/school-assistant",
    {
      message:
        "Create and publish an assessment for my current class and submit my graded answers for me.",
      mode: "agentic",
      history: [],
      context: { view: "learning" },
    },
    student.session.access_token,
  );
  assert.equal(forbidden.proposedAction, null);
  record("student assessed-work boundary", { forbiddenActionStripped: true });
  await mkdir("artifacts/assistant-knowledge", { recursive: true });
  await writeFile(
    "artifacts/assistant-knowledge/live-qa.json",
    JSON.stringify({ origin: config.vercel.productionUrl, results }, null, 2),
    { mode: 0o600 },
  );
} finally {
  if (announcement && faculty) {
    const result = await faculty.db
      .from("announcements")
      .delete()
      .eq("id", announcement);
    if (result.error) throw Error("Announcement fixture cleanup failed");
  }
  await cleanupFixtures();
}
console.log(
  JSON.stringify({
    status: "passed",
    checks: results.length,
    fixturesRemoved: true,
  }),
);
