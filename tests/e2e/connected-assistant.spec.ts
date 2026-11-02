import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deploymentEnvironment } from "../../scripts/deployment-env.mjs";
import { loadAssistantContext } from "../../server/assistantContext.js";
import { database, statePath } from "./client-fixtures.mjs";
import { clientForRole } from "../helpers/role-client.mjs";
let state: any;
test.beforeAll(async () => {
  state = JSON.parse(await readFile(statePath, "utf8"));
  Object.assign(process.env, deploymentEnvironment());
});
async function openChat(page: Page, path = "/") {
  await page.goto(path);
  await page.getByRole("button", { name: "開啟 AI 校園助理" }).click();
  await expect(
    page.getByRole("heading", { name: "校園助理 · Assistant" }),
  ).toBeVisible();
}

test("public chat is usable across all public pages, follows up with sources, and restores focus on Escape", async ({
  page,
}) => {
  test.setTimeout(120000);
  const requests: any[] = [];
  await page.route("**/api/research-assistant", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "answered",
        answer:
          "The registrar can be reached at **07-615-8000**. Confirm the current extension with the office.",
        citations: [
          {
            chunkId: "public-contact",
            claim: "Contact phone",
            title: "Registrar contact",
            sourceName: "Dated school reference",
            url: "https://www.aca.stu.edu.tw/",
            reviewedAt: "2026-11-03T00:00:00Z",
            locator: null,
          },
        ],
        suggestedQuestions: [],
        feedback: { token: "f".repeat(64), expiresAt: "2026-12-01T00:00:00Z" },
      }),
    });
  });
  for (const width of [1440, 390, 320])
    for (const path of ["/", "/在校學生/", "/school-affairs", "/student-sso"]) {
      await page.setViewportSize({ width, height: 900 });
      await openChat(page, path);
      await page
        .getByLabel("Your question")
        .fill("What is the registrar phone number?");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        page
          .getByRole("list", { name: "Sources" })
          .getByRole("link", { name: "Registrar contact" }),
      ).toBeVisible();
      await expect(page.getByRole("log")).toContainText("07-615-8000");
      await page.getByLabel("Your question").fill("What about the email?");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByRole("log").getByRole("article")).toHaveCount(4);
      expect(requests.at(-1).history).toHaveLength(2);
      expect(requests.at(-1).history[0].content).toContain("registrar");
      const accessibility = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "開啟 AI 校園助理" }),
      ).toBeFocused();
    }
});

test("signed-in public chat uses the authenticated QA endpoint and does not forward client data", async ({
  page,
}) => {
  await page.addInitScript(
    (session) =>
      localStorage.setItem("stu-nexus-auth", JSON.stringify(session)),
    state.users.student.session,
  );
  let authorized = false;
  await page.route("**/api/research-assistant", () => {
    throw Error("Signed-in chat must not downgrade to public");
  });
  await page.route("**/api/school-assistant", (route) => {
    const body = route.request().postDataJSON();
    expect(body.mode).toBe("qa");
    expect(body.context).toEqual({ view: "public-website" });
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    authorized = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "Your enrolled app subject is the fixture Teaching Course.",
        knowledgeCitations: [],
      }),
    });
  });
  await openChat(page, "/在校學生/");
  await expect(
    page.getByText(
      "Signed in. Answers use the records your account can access.",
    ),
  ).toBeVisible();
  await page.getByLabel("Your question").fill("What are my current subjects?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("enrolled app subject");
  expect(authorized).toBe(true);
});

test("server context proves student ownership and staff assignments with live RLS", async () => {
  test.setTimeout(60000);
  for (const role of ["student", "faculty", "owner"]) {
    const db = await clientForRole(state, role),
      session = (await db.auth.getSession()).data.session!;
    const context = (await loadAssistantContext(
      { id: session.user.id, role },
      "Bearer " + session.access_token,
    )) as any;
    expect(context.unavailable).toEqual([]);
    expect(context.identity.id).toBe(session.user.id);
    expect(
      context.courses.some(
        (course: any) => course.sectionId === state.ids.section,
      ),
    ).toBe(true);
    if (role === "student") {
      expect(
        context.profiles.every(
          (profile: any) => profile.id === session.user.id,
        ),
      ).toBe(true);
      expect(
        context.students.every(
          (student: any) => student.profileId === session.user.id,
        ),
      ).toBe(true);
      expect(
        context.enrollments.every(
          (enrollment: any) => enrollment.studentProfileId === session.user.id,
        ),
      ).toBe(true);
    }
  }
});

test("retrieval enforces anonymous, staff, role, class, expiry and draft boundaries even for the owner", async () => {
  test.setTimeout(90000);
  const sql = await database(),
    source = randomUUID(),
    marker = `RAG82${Date.now()}`;
  const documents = [
    ["public", "public", [], null, "published", false, false],
    ["staff", "staff", [], null, "published", false, false],
    ["faculty", "role", ["faculty"], null, "published", false, false],
    ["finance", "role", ["finance"], null, "published", false, false],
    ["class", "class", [], state.ids.section, "published", false, false],
    ["expired", "public", [], null, "published", true, false],
    ["review-due", "public", [], null, "published", false, true],
    ["draft", "public", [], null, "draft", false, false],
  ] as any[];
  try {
    await sql`insert into public.knowledge_sources(id,name,source_type,canonical_url,authority_level,owner_profile_id,robots_reviewed_at,active) values(${source},${"Ingestion verification " + marker},'manual',${"https://stu.best/ingestion/" + marker},'reviewed_internal',${state.users.owner.id},now(),true)`;
    for (const [
      name,
      scope,
      roles,
      section,
      status,
      expired,
      reviewDue,
    ] of documents) {
      const id = randomUUID(),
        effective = new Date(Date.now() - 86400000),
        expires = new Date(Date.now() + (expired ? -1000 : 86400000)),
        review = new Date(Date.now() + (reviewDue ? -1000 : 86400000));
      await sql`insert into public.knowledge_documents(id,source_id,logical_key,title,domain,document_type,language,source_url,content_checksum,version,extraction_status,review_status,publication_status,sensitivity,audience_scope,audience_roles,section_id,owner_profile_id,reviewer_profile_id,reviewed_at,published_at,effective_at,expires_at,review_due_at) values(${id},${source},${name},${marker + " " + name},'faq','verification','en','https://stu.best/',${createHash(
        "sha256",
      )
        .update(marker + name)
        .digest(
          "hex",
        )},${documents.findIndex((d) => d[0] === name) + 1},'normalized','approved',${status},${scope === "public" ? "public" : "institution"},${scope},${roles},${section},${state.users.owner.id},${state.users.owner.id},now(),now(),${effective},${expires},${review})`;
      await sql`insert into public.knowledge_chunks(document_id,chunk_key,ordinal,content,content_checksum,language,embedding,embedding_model,active,effective_at,expires_at) values(${id},${name},0,${marker + " " + name + " reference"},${"b".repeat(64)},'en',${"[" + Array(1536).fill(0).join(",") + "]"}::extensions.vector,'test-fixture',true,${effective},${expires})`;
    }
    const env = deploymentEnvironment(),
      anon = createClient(
        env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
        env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
    const query = {
      p_query: marker,
      p_embedding: null,
      p_language: "en",
      p_domain: null,
      p_limit: 20,
    };
    const publicResult = await anon.rpc("search_public_knowledge", query);
    expect(publicResult.error).toBeNull();
    expect(
      publicResult.data
        .filter((r: any) => r.source_id === source)
        .map((r: any) => r.document_title.replace(marker + " ", "")),
    ).toEqual(["public"]);
    expect(
      (await anon.rpc("search_assistant_knowledge", query)).error,
    ).not.toBeNull();
    for (const [role, expected] of [
      ["student", ["public", "class"]],
      ["faculty", ["public", "staff", "faculty", "class"]],
      ["finance", ["public", "staff", "finance"]],
      ["owner", ["public", "staff", "faculty", "finance", "class"]],
    ] as [string, string[]][]) {
      const db = await clientForRole(state, role),
        result = await db.rpc("search_assistant_knowledge", query);
      expect(result.error).toBeNull();
      expect(
        result.data
          .filter((r: any) => r.source_id === source)
          .map((r: any) => r.document_title.replace(marker + " ", ""))
          .sort(),
      ).toEqual(expected.sort());
    }
    // SIS imports may link the roster through students.profile_id only.
    const roster =
      await sql`update public.section_enrollments set student_profile_id=null where section_id=${state.ids.section} and student_profile_id=${state.users.student.id} returning id,student_id`;
    expect(roster.length).toBe(1);
    expect(roster[0].student_id).toBeTruthy();
    const studentDb = await clientForRole(state, "student");
    const linked = await studentDb.rpc("search_assistant_knowledge", query);
    expect(linked.error).toBeNull();
    expect(
      linked.data
        .filter((r: any) => r.source_id === source)
        .map((r: any) => r.document_title.replace(marker + " ", ""))
        .sort(),
    ).toEqual(["class", "public"]);
    const session = (await studentDb.auth.getSession()).data.session!;
    const linkedContext = (await loadAssistantContext(
      { id: session.user.id, role: "student" },
      "Bearer " + session.access_token,
    )) as any;
    expect(
      linkedContext.myCourses.some(
        (course: any) => course.sectionId === state.ids.section,
      ),
    ).toBe(true);
  } finally {
    await sql`update public.section_enrollments set student_profile_id=${state.users.student.id} where section_id=${state.ids.section} and student_id=${state.ids.student}`;
    await sql`delete from public.knowledge_documents where source_id=${source}`;
    await sql`delete from public.knowledge_sources where id=${source}`;
    await sql.end();
  }
});

test("teacher agent saves only confirmed changes and continues a two-step goal using real record IDs", async ({
  page,
}) => {
  test.setTimeout(120000);
  const db = await clientForRole(state, "faculty"),
    title = `${state.marker} Agent module`,
    lesson = `${state.marker} Agent lesson`;
  let step = 0;
  await page.addInitScript(
    (session) =>
      localStorage.setItem("stu-nexus-auth", JSON.stringify(session)),
    state.users.faculty.session,
  );
  await page.route("**/api/school-assistant", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.mode).toBe("agentic");
    expect(Object.keys(input.context)).toEqual(["view"]);
    step++;
    const action: any = {
      type: "create_module",
      sectionId: state.ids.section,
      title,
      description: "A draft module for confirmed agent QA.",
      publish: false,
      confirmation: "Create the draft module",
    };
    if (step === 2) {
      expect(
        input.agent.observations.some((o: any) => o.outcome === "success"),
      ).toBe(true);
      const saved = await db
        .from("learning_modules")
        .select("id")
        .eq("section_id", state.ids.section)
        .eq("title", title)
        .single();
      expect(saved.error).toBeNull();
      Object.assign(action, {
        type: "create_material",
        moduleId: saved.data!.id,
        title: lesson,
        description: "Agent lesson",
        content: "Read this introductory learning material.",
        materialType: "lesson",
        minutes: 10,
        required: false,
        confirmation: "Create the draft lesson",
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer:
          step < 3
            ? "Review the next draft change."
            : "The draft module and lesson were saved after confirmation.",
        suggestedActions: [],
        citations: ["Platform context"],
        proposedAction: step < 3 ? action : null,
        source: "openai",
        agent: {
          status: step < 3 ? "working" : "complete",
          goalSummary: "Create a draft module and lesson",
          stepSummary: "Confirmed workflow",
          terminalReason: "",
          plan: ["Create module", "Create lesson"],
          remainingWork:
            step === 1
              ? ["Create module", "Create lesson"]
              : step === 2
                ? ["Create lesson"]
                : [],
          clarification: null,
        },
      }),
    });
  });
  await page.goto("/app/courses");
  await expect(page.locator(".school-content")).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Assistant",
    exact: true,
  });
  await panel.getByRole("button", { name: /Draft changes/ }).click();
  await panel
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(
      "Create a draft module and an introductory lesson for my teaching class.",
    );
  await panel.getByRole("button", { name: /^Send/ }).click();
  await expect(
    panel.getByText("Create the draft module", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await db
        .from("learning_modules")
        .select("id")
        .eq("section_id", state.ids.section)
        .eq("title", title)
    ).data,
  ).toEqual([]);
  await panel
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    panel.getByText("Create the draft lesson", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  expect(
    (await db.from("learning_materials").select("id").eq("title", lesson)).data,
  ).toEqual([]);
  await panel
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    panel.getByText(
      "The draft module and lesson were saved after confirmation.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 45000 });
  const saved = await db
    .from("learning_materials")
    .select("id,status")
    .eq("title", lesson)
    .single();
  expect(saved.error).toBeNull();
  expect(saved.data!.status).toBe("draft");
  expect(step).toBe(3);
  const student = await clientForRole(state, "student");
  expect(
    (
      await student
        .from("learning_materials")
        .select("id")
        .eq("id", saved.data!.id)
    ).data,
  ).toEqual([]);
});
