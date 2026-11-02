import assert from "node:assert/strict";
import { after, test } from "node:test";
import { loadAssistantContext, schoolCalendarDate } from "../../server/assistantContext.js";
import { searchAssistantKnowledge } from "../../server/assistantKnowledge.js";
const originalFetch = globalThis.fetch;
const environment = { ...process.env };
after(() => {
  globalThis.fetch = originalFetch;
  process.env = environment;
});
function configure() {
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.OPENAI_API_KEY = "test-key";
}
const user = { id: "person-1", role: "student" };
test("account context uses only caller JWT and database fields, with complete announcement and timetable facts", async () => {
  configure();
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.pathname + url.search);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer verified-caller-session",
    );
    assert.doesNotMatch(
      url.search,
      /answer_keys|password|employee_number|risk_score/,
    );
    if (url.pathname.endsWith("/profiles"))
      return Response.json([
        {
          id: "person-1",
          full_name: "Student A",
          role: "student",
          account_status: "active",
        },
      ]);
    if (url.pathname.endsWith("/courses"))
      return Response.json([
        {
          id: "course-1",
          code: "IM101",
          title: "Information Systems",
          description: "Real subject summary",
        },
      ]);
    if (url.pathname.endsWith("/course_sections"))
      return Response.json([
        {
          id: "section-1",
          course_id: "course-1",
          term_id: "term-1",
          section_code: "A",
        },
      ]);
    if (url.pathname.endsWith("/academic_terms"))
      return Response.json([
        { id: "term-1", name: "Current term", status: "active" },
      ]);
    if (url.pathname.endsWith("/announcements")) {
      assert.equal(url.searchParams.get("order"), "published_at.desc");
      return Response.json([
        {
          id: "notice-1",
          title: "Room change",
          body: "Meet in Room 201",
          published_at: "2026-11-02T00:00:00Z",
        },
      ]);
    }
    if (url.pathname.endsWith("/schedule_events"))
      return Response.json([
        {
          id: "event-1",
          starts_at: "2026-11-04T01:00:00Z",
          ends_at: "2026-11-04T02:00:00Z",
          location: "Room 201",
        },
      ]);
    return Response.json([]);
  };
  const context = (await loadAssistantContext(
    user,
    "Bearer verified-caller-session",
    "learning",
  )) as {
    courses: { title: string; term: string }[];
    announcements: { body: string }[];
    schedule: { startsAt: string; location: string }[];
    unavailable: string[];
  };
  assert.equal(context.courses[0].title, "Information Systems");
  assert.equal(context.courses[0].term, "Current term");
  assert.equal(context.announcements[0].body, "Meet in Room 201");
  assert.equal(context.schedule[0].location, "Room 201");
  assert.deepEqual(context.unavailable, []);
  assert.ok(requests.length > 15);
});
test("inactive or mismatched profile stops before any account collection is read", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json([
      { id: "person-1", role: "owner", account_status: "active" },
    ]);
  };
  await assert.rejects(
    loadAssistantContext(user, "Bearer verified-caller-session"),
    /active account/,
  );
  assert.equal(calls, 1);
});
test("failed account reads are marked unavailable rather than silently claimed empty", async () => {
  configure();
  globalThis.fetch = async (input) =>
    String(input).includes("/profiles?")
      ? Response.json([
          { id: "person-1", role: "student", account_status: "active" },
        ])
      : new Response("{}", { status: 503 });
  const context = (await loadAssistantContext(
    user,
    "Bearer verified-caller-session",
  )) as { unavailable: string[]; courses: unknown[] };
  assert.ok(context.unavailable.includes("sections"));
  assert.deepEqual(context.courses, []);
});
test("internal retrieval carries caller JWT; anonymous retrieval never does", async () => {
  configure();
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/embeddings"))
      return Response.json({ data: [{ embedding: Array(1536).fill(0) }] });
    paths.push(url);
    const headers = init?.headers as Record<string, string>;
    if (url.endsWith("search_assistant_knowledge"))
      assert.equal(headers.Authorization, "Bearer session-for-student");
    else assert.equal(headers.Authorization, "Bearer sb_publishable_test");
    return Response.json([
      {
        chunk_id: "eligible",
        exact_score: 1,
        keyword_score: 1,
        vector_score: 0.7,
      },
    ]);
  };
  assert.equal(
    (
      await searchAssistantKnowledge("registrar", {
        authorization: "Bearer session-for-student",
      })
    ).evidence.length,
    1,
  );
  assert.equal(
    (await searchAssistantKnowledge("registrar")).evidence.length,
    1,
  );
  assert.ok(paths[0].endsWith("search_assistant_knowledge"));
  assert.ok(paths[1].endsWith("search_public_knowledge"));
});
test("embedding outage falls back to filtered keyword retrieval, without a privileged read", async () => {
  configure();
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/embeddings"))
      throw new Error("Provider unavailable");
    assert.equal(JSON.parse(String(init?.body)).p_embedding, null);
    return Response.json([
      {
        chunk_id: "keyword",
        keyword_score: 0.1,
        exact_score: 0,
        vector_score: 0,
      },
      {
        chunk_id: "irrelevant",
        keyword_score: 0,
        exact_score: 0,
        vector_score: 0,
      },
    ]);
  };
  const result = await searchAssistantKnowledge("registrar");
  assert.equal(result.degraded, true);
  assert.deepEqual(
    result.evidence.map((row) => row.chunk_id),
    ["keyword"],
  );
});

test('current school date uses Taipei rather than the preceding UTC date',()=>{
 assert.equal(schoolCalendarDate(new Date('2026-11-02T16:01:00Z')),'2026-11-03');
 assert.equal(schoolCalendarDate(new Date('2026-11-02T15:59:00Z')),'2026-11-02');
});

test('student ownership also follows the linked SIS student record without a profile ID on enrollment',async()=>{
 configure();globalThis.fetch=async input=>{
  const path=new URL(String(input)).pathname;
  if(path.endsWith('/profiles'))return Response.json([{id:'person-1',role:'student',account_status:'active'}]);
  if(path.endsWith('/students'))return Response.json([{id:'sis-1',profile_id:'person-1'}]);
  if(path.endsWith('/section_enrollments')||path.endsWith('/grades'))return Response.json([{id:'own-linked',student_id:'sis-1',student_profile_id:null},{id:'foreign',student_id:'sis-2',student_profile_id:'person-2'}]);
  return Response.json([]);
 };
 const context=await loadAssistantContext(user,'Bearer verified-caller-session') as {enrollments:{id:string}[];grades:{id:string}[]};
 assert.deepEqual(context.enrollments.map(row=>row.id),['own-linked']);assert.deepEqual(context.grades.map(row=>row.id),['own-linked']);
});
test('unrelated private free-text details are omitted from a subject question',async()=>{
 configure();globalThis.fetch=async input=>{
  const path=new URL(String(input)).pathname;
  if(path.endsWith('/profiles'))return Response.json([{id:'person-1',role:'student',account_status:'active'}]);
  if(path.endsWith('/cases'))return Response.json([{id:'case-1',title:'Own case',description:'Private free-text not needed for subject lookup'}]);
  return Response.json([]);
 };
 const context=await loadAssistantContext(user,'Bearer verified-caller-session','learning','What are my subjects?');
 assert.doesNotMatch(JSON.stringify(context),/Private free-text/);assert.ok((context.detailsOmitted as string[]).includes('supportRequests'));
});
