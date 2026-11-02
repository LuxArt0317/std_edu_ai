import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { admin, database, statePath } from "./demo-fixtures.mjs";
const s = JSON.parse(await readFile(statePath, "utf8"));
if (!s.ready) throw Error("Demo fixtures not ready");
const names = {
  admin: "Taylor Morgan (Demo)",
  president: "Riley Chen (Demo)",
  vice_president: "Cameron Park (Demo)",
  dean: "Avery Reed (Demo)",
  registrar: "Jordan Blake (Demo)",
  department_head: "Jamie Cruz (Demo)",
  faculty: "Maya Santos (Demo)",
  advisor: "Morgan Lee (Demo)",
  admissions: "Sam Patel (Demo)",
  finance: "Drew Kim (Demo)",
  support: "Casey Rivera (Demo)",
  librarian: "Robin Ellis (Demo)",
  student: "Alex Rivera (Demo)",
};
for (const [role, name] of Object.entries(names)) {
  const db = await database();
  try {
    await db`update public.profiles set full_name=${name},department_id=${s.ids.department},program_id=${s.ids.program} where id=${s.users[role].id}`;
  } finally {
    await db.end();
  }
}
let ids;
try {
  ids = JSON.parse(await readFile("artifacts/tutorials/demo-ids.json", "utf8"));
} catch {
  ids = Object.fromEntries(
    [
      "module",
      "lesson",
      "draftModule",
      "draftLesson",
      "page",
      "secondPage",
      "gradeItem",
      "grade",
      "event",
      "attendance",
      "announcement",
      "quiz",
    ].map((k) => [k, randomUUID()]),
  );
  await writeFile("artifacts/tutorials/demo-ids.json", JSON.stringify(ids), {
    mode: 0o600,
  });
}
const sql = await database();
try {
  await sql.begin(async (t) => {
    await t`update departments set code='DEMO',name='Learning Innovation' where id=${s.ids.department}`;
    await t`update academic_programs set code='DEMO-BS',name='Digital Studies (Demo)' where id=${s.ids.program}`;
    await t`update academic_terms set code='DEMO-2026',name='Teaching term 2026 (Demo)' where id=${s.ids.term}`;
    await t`update courses set code='DEMO101',title='Digital Skills for Everyday Work' where id=${s.ids.course}`;
    await t`update course_sections set section_code='A',room='Learning Lab 201' where id=${s.ids.section}`;
    await t`update students set full_name='Alex Rivera (Demo)',student_number='DEMO-001',program='Digital Studies (Demo)',gpa=2.8,attendance_percent=72,engagement_score=62,outstanding_balance=1500,risk_score=48,risk_level='medium',next_best_action='Check the registration question and agree on one next step.' where id=${s.ids.student}`;
    await t`insert into learning_modules(id,section_id,title,description,position,status,published_at,created_by) values (${ids.module},${s.ids.section},'Week 1 · Working with information','Start with a clear question, use a trusted source, and explain your next step.',1,'published',now(),${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into learning_materials(id,module_id,title,material_type,content_markdown,position,status,published_at,created_by,estimated_minutes) values (${ids.lesson},${ids.module},'Make a clear next step','lesson','Start with the question. Check the source. Choose one practical action.',1,'published',now(),${s.users.faculty.id},8) on conflict(id) do nothing`;
    await t`insert into learning_material_pages(id,material_id,title,content_html,position,created_by) values (${ids.page},${ids.lesson},'Start with a useful question','<h2>Make a clear next step</h2><p>A good learning workflow starts with one question you can act on.</p><h3>Try this three-step check</h3><ol><li><strong>Clarify:</strong> What do I need to understand?</li><li><strong>Verify:</strong> Which source supports the answer?</li><li><strong>Act:</strong> What is one useful next step?</li></ol><p><em>Practice:</em> Write a question about an upcoming class task. Add the source you will check.</p>',1,${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into learning_material_pages(id,material_id,title,content_html,position,created_by) values (${ids.secondPage},${ids.lesson},'Check your next action','<h2>Turn information into action</h2><p>Choose a next step that is specific, small, and easy to check.</p><blockquote>Instead of “study more”, choose “read the first lesson and answer the practice question before Tuesday”.</blockquote><h3>Your checkpoint</h3><p>Can you explain the task, name the source, and describe when it is finished?</p>',2,${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into learning_modules(id,section_id,title,description,position,status,created_by) values (${ids.draftModule},${s.ids.section},'Week 2 · Responsible AI','Use AI as a starting point and verify important claims.',2,'draft',${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into learning_materials(id,module_id,title,material_type,content_markdown,position,status,created_by) values (${ids.draftLesson},${ids.draftModule},'Verify an AI suggestion','lesson','An AI response is a starting point. Check the original source, confirm the context, and choose a human-reviewed next step.',1,'draft',${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into grade_items(id,section_id,title,category,max_score,weight_percent,due_at) values (${ids.gradeItem},${s.ids.section},'Week 1 reflection','Coursework',20,20,now()+interval '7 days') on conflict(id) do nothing`;
    await t`insert into grades(id,grade_item_id,student_profile_id,student_id,score,feedback,status,graded_by) values (${ids.grade},${ids.gradeItem},${s.users.student.id},${s.ids.student},18,'Clear reasoning. Next time, include the original source link.','draft',${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into schedule_events(id,section_id,title,description,event_type,starts_at,ends_at,location,created_by) values (${ids.event},${s.ids.section},'Digital skills workshop','Bring one question and a source you want to check. Demonstration class event.','class',date_trunc('day',now())+interval '1 day 1 hour',date_trunc('day',now())+interval '1 day 2 hours','Learning Lab 201',${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into attendance_sessions(id,section_id,title,starts_at,ends_at,status,created_by) values (${ids.attendance},${s.ids.section},'Week 1 workshop',now()-interval '1 day',now()-interval '1 day'+interval '1 hour','open',${s.users.faculty.id}) on conflict(id) do nothing`;
    await t`insert into announcements(id,section_id,author_id,title,body,priority,published_at) values (${ids.announcement},${s.ids.section},${s.users.faculty.id},'Welcome to Digital Skills','Read the first lesson, complete the short quiz, and bring one question to our next workshop. These are demonstration records.','normal',now()) on conflict(id) do nothing`;
  });
  const { data: exists } = await admin
    .from("assessments")
    .select("id")
    .eq("id", ids.quiz)
    .maybeSingle();
  if (!exists) {
    const { clientForRole } =
      await import("../../../tests/helpers/role-client.mjs");
    const faculty = await clientForRole(s, "faculty");
    const r = await faculty.rpc("create_lms_assessment", {
      p_section_id: s.ids.section,
      p_title: "Information and AI check",
      p_instructions:
        "Choose the best answer. Review the feedback after submitting this demonstration quiz.",
      p_type: "quiz",
      p_due_at: new Date(Date.now() + 604800000).toISOString(),
      p_max_score: 6,
      p_publish: true,
      p_questions: [
        {
          prompt: "What is a useful first step when a task is unclear?",
          points: 2,
          options: [
            "Clarify the question",
            "Guess the expected answer",
            "Skip the instructions",
          ],
          correctOption: 1,
          explanation:
            "A clear question helps you choose the right information and action.",
        },
        {
          prompt: "How should you use an important AI suggestion?",
          points: 2,
          options: [
            "Verify the source and context",
            "Accept it without checking",
            "Treat it as an official approval",
          ],
          correctOption: 1,
          explanation: "AI guidance needs context, evidence, and human review.",
        },
        {
          prompt: "Which next step is easiest to check?",
          points: 2,
          options: [
            "Read lesson one and answer the practice question",
            "Improve everything",
            "Wait for someone else",
          ],
          correctOption: 1,
          explanation: "A specific action makes progress visible.",
        },
      ],
    });
    if (r.error) throw r.error;
    ids.quiz = r.data;
    await writeFile("artifacts/tutorials/demo-ids.json", JSON.stringify(ids), {
      mode: 0o600,
    });
    const updated = await admin
      .from("assessments")
      .update({
        review_mode: "full_review",
        release_explanations: true,
        attempt_limit: 2,
        require_fullscreen: false,
        monitor_focus: false,
        require_camera: false,
        detect_extended_display: false,
      })
      .eq("id", ids.quiz);
    if (updated.error) throw updated.error;
  }
  const existingRequest =
    await sql`select id from public.curriculum_change_requests where section_id=${s.ids.section}`;
  if (!existingRequest.length) {
    const { clientForRole } =
      await import("../../../tests/helpers/role-client.mjs");
    const faculty = await clientForRole(s, "faculty");
    const proposal = await faculty.rpc("manage_curriculum_change_request", {
      p_action: "create",
      p_section_id: s.ids.section,
      p_summary: "Add a source-checking practice task (Demo)",
      p_details:
        "Add a short guided practice that asks learners to verify an AI suggestion against the original course source. Synthetic tutorial proposal; no institutional approval is asserted.",
    });
    if (proposal.error) throw proposal.error;
  }
  console.log(
    JSON.stringify({
      seeded: true,
      temporaryRoles: Object.keys(names).length,
      course: "DEMO101",
      moduleCount: 2,
      quizQuestions: 3,
      gradeDraft: true,
    }),
  );
} finally {
  await sql.end();
}

await import("./seed-assignments.mjs");
