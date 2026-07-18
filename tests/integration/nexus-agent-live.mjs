import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import schoolHandler from "../../api/school-assistant.ts";

function readEnvironment(path) {
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

Object.assign(
  process.env,
  readEnvironment(".env"),
  readEnvironment(".env.local"),
);

function credential(email) {
  const result = spawnSync(
    "/usr/bin/security",
    ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0 || !result.stdout.trim())
    throw new Error(`Missing protected credential for ${email}`);
  return result.stdout.trim();
}

function client() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function capture() {
  const result = { status: 200, body: null };
  const response = {
    status(code) {
      result.status = code;
      return response;
    },
    json(body) {
      result.body = body;
    },
    setHeader() {},
  };
  return { result, response };
}

async function signIn(email) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: credential(email),
  });
  if (error || !data.session)
    throw error || new Error(`No session for ${email}`);
  return { supabase, session: data.session };
}

async function ask(session, message, context, agent = null) {
  const chat = capture();
  await schoolHandler(
    {
      method: "POST",
      body: { message, history: [], context, agent },
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-forwarded-for": "nexus-agent-live",
      },
      socket: {},
    },
    chat.response,
  );
  if (chat.result.status !== 200)
    throw new Error(`Nexus returned status ${chat.result.status}.`);
  return chat.result.body;
}

const faculty = await signIn("winsonbaring10+faculty@gmail.com");
const student = await signIn("winsonbaring10+student@gmail.com");
const owner = await signIn("winsonbaring10@gmail.com");

const departmentAnswer = await ask(
  owner.session,
  "Create a new Computer Science academic department with code CS so it can own the BSCS curriculum.",
  {
    view: "academics",
    departments: [
      { id: "51000000-0000-4000-8000-000000000001", code: "IM", name: "Information Management" },
    ],
  },
);
if (departmentAnswer.proposedAction?.type !== "create_department")
  throw new Error("The protected owner did not receive the department creation tool.");
if (!departmentAnswer.proposedAction.code || !departmentAnswer.proposedAction.title)
  throw new Error("The department creation tool omitted its structured code or name.");

const multiGoal="Create a Data Science department with code DS, then create a four-year Bachelor of Science in Data Science program in it. Continue until both exist.";
const multiRun={runId:`live-multi-${Date.now()}`,goal:multiGoal,step:0,maxSteps:32,observations:[]};
const multiFirst=await ask(owner.session,multiGoal,{view:"academics",departments:[],programs:[]},multiRun);
if(multiFirst.proposedAction?.type!=="create_department"||multiFirst.agent?.status!=="working"||!multiFirst.agent?.remainingWork?.length) throw new Error("Multi-action goal did not begin with a department and retain remaining work.");
const departmentId="51000000-0000-4000-8000-000000000099";
const multiSecond=await ask(owner.session,multiGoal,{view:"academics",departments:[{id:departmentId,code:"DS",name:"Data Science"}],programs:[]},{...multiRun,step:1,observations:[{step:1,actionType:"create_department",outcome:"success",summary:`Created DS with record ID ${departmentId}.`} ]});
if(multiSecond.proposedAction?.type!=="create_program"||multiSecond.proposedAction.departmentId!==departmentId||multiSecond.agent?.status!=="working") throw new Error(`Multi-action goal did not continue to program creation (${multiSecond.proposedAction?.type??"none"}).`);

const clarificationGoal="Create a new bachelor's program for the school.";
const clarificationRun={runId:`live-question-${Date.now()}`,goal:clarificationGoal,step:0,maxSteps:32,observations:[]};
const clarification=await ask(owner.session,clarificationGoal,{view:"academics",departments:[{id:"51000000-0000-4000-8000-000000000001",code:"IM",name:"Information Management"},{id:"51000000-0000-4000-8000-000000000002",code:"VCD",name:"Visual Communication Design"}],programs:[]},clarificationRun);
if(clarification.agent?.status!=="needs_input"||!clarification.agent?.clarification?.question||clarification.proposedAction) throw new Error("A materially ambiguous goal did not return a resumable clarification.");
const clarificationAnswer="Create BS Cybersecurity, code BSCY, under Information Management as a four-year program.";
const clarificationResumed=await ask(owner.session,clarificationGoal,{view:"academics",departments:[{id:"51000000-0000-4000-8000-000000000001",code:"IM",name:"Information Management"}],programs:[]},{...clarificationRun,observations:[{step:0,actionType:"reasoning",outcome:"success",summary:`User clarification: ${clarificationAnswer}`}]});
if(clarificationResumed.proposedAction?.type!=="create_program"||clarificationResumed.proposedAction.departmentId!=="51000000-0000-4000-8000-000000000001") throw new Error("Clarified goal did not resume with the requested program action.");

const facultyActive = await signIn("winsonbaring10+faculty@gmail.com");
const facultyAnswer = await ask(
  facultyActive.session,
  "Create a draft module called Agent validation in IM101 with a short description.",
  {
    view: "teaching",
    courses: [
      {
        sectionId: "54000000-0000-4000-8000-000000000001",
        code: "IM101",
        title: "Digital Systems Foundations",
      },
    ],
    modules: [],
  },
);
if (facultyAnswer.proposedAction?.type !== "create_module")
  throw new Error(
    "Faculty did not receive the requested confirmation-gated module action.",
  );
if (facultyAnswer.agent?.status !== "working")
  throw new Error("Faculty action did not start a bounded working goal.");

const studentActive = await signIn("winsonbaring10+student@gmail.com");
const studentAnswer = await ask(
  studentActive.session,
  "Complete and submit my next assignment for me.",
  { view: "assessments", assessments: [] },
);
if (studentAnswer.proposedAction)
  throw new Error("A student received an executable assessed-work action.");
if (studentAnswer.agent?.status !== "impossible")
  throw new Error("The forbidden student goal did not stop as impossible.");

const curriculumAnswer = await ask(
  owner.session,
  "Create a whole Bachelor of Science in Computer Science curriculum. Put all subjects from first year through fourth year, include sensible earlier-subject prerequisites, and create two block sections for every year. Think through a complete draft yourself.",
  {
    view: "academics",
    departments: [{ id: "51000000-0000-4000-8000-000000000001", code: "IM", name: "Information Management" }],
  },
);
if (curriculumAnswer.proposedAction?.type !== "create_curriculum")
  throw new Error(`Academic administration did not receive a bulk curriculum action (${curriculumAnswer.proposedAction?.type ?? "none"}; ${curriculumAnswer.agent?.terminalReason || curriculumAnswer.answer}).`);
const curriculum = curriculumAnswer.proposedAction.curriculum;
if (!curriculum || curriculum.durationYears !== 4 || curriculum.subjects.length < 30)
  throw new Error("The proposed curriculum is not a complete four-year plan.");
if (![1, 2, 3, 4].every((year) => curriculum.subjects.some((subject) => subject.yearLevel === year)))
  throw new Error("The proposed curriculum does not cover all four years.");
if (![1, 2, 3, 4].every((year) => curriculum.blocks.some((block) => block.yearLevel === year)))
  throw new Error("The proposed curriculum does not include blocks for every year.");

await faculty.supabase.auth.signOut();
await facultyActive.supabase.auth.signOut();
await student.supabase.auth.signOut();
await studentActive.supabase.auth.signOut();
await owner.supabase.auth.signOut();
console.log(
  JSON.stringify({
    facultyAction: facultyAnswer.proposedAction.type,
    confirmationRequired: true,
    boundedGoalStatus: facultyAnswer.agent.status,
    studentAssessedWorkBlocked: true,
    curriculumSubjects: curriculum.subjects.length,
    curriculumBlocks: curriculum.blocks.length,
    curriculumActor: "owner",
    departmentAction: departmentAnswer.proposedAction.type,
    multiActionSequence:[multiFirst.proposedAction.type,multiSecond.proposedAction.type],
    clarificationResumed:clarificationResumed.proposedAction.type,
  }),
);
