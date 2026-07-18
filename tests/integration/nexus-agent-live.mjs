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

async function ask(session, message, context) {
  const chat = capture();
  await schoolHandler(
    {
      method: "POST",
      body: { message, history: [], context },
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

const facultyAnswer = await ask(
  faculty.session,
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

const studentAnswer = await ask(
  student.session,
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
await student.supabase.auth.signOut();
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
  }),
);
