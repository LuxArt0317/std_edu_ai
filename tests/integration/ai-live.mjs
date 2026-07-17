import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import schoolHandler from "../../api/school-assistant.ts";
import gradeScanHandler from "../../api/grade-scan.ts";

function readEnvironment(path) {
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
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
const email = process.env.CRM_FACULTY_EMAIL;
const password = process.env.CRM_FACULTY_PASSWORD;
const fixturePath = process.env.GRADE_SCAN_FIXTURE;
if (!email || !password || !fixturePath)
  throw new Error("Faculty credentials and GRADE_SCAN_FIXTURE are required.");

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: auth, error: authError } = await client.auth.signInWithPassword({
  email,
  password,
});
if (authError || !auth.session)
  throw authError || new Error("Faculty session was not issued.");

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

const chat = capture();
await schoolHandler(
  {
    method: "POST",
    body: {
      message: "Give me a concise preparation brief for teaching IM101.",
      history: [],
      context: {
        view: "teaching",
        courseCodes: ["IM101"],
        courseTitles: ["Digital Systems Foundations"],
        knowledgeTitles: [
          "How information systems create value",
          "Networks, identity, and security basics",
        ],
      },
    },
    headers: {
      authorization: `Bearer ${auth.session.access_token}`,
      "x-forwarded-for": "live-ai-test",
    },
    socket: {},
  },
  chat.response,
);
if (
  chat.result.status !== 200 ||
  typeof chat.result.body?.answer !== "string" ||
  !chat.result.body.citations?.length
)
  throw new Error(
    `Live school chatbot failed with status ${chat.result.status}.`,
  );

const imageBase64 = fs.readFileSync(fixturePath).toString("base64");
const grade = capture();
await gradeScanHandler(
  {
    method: "POST",
    body: {
      imageDataUrl: `data:image/png;base64,${imageBase64}`,
      title: "IM101 systems check",
      maxScore: 5,
      roster: [
        { studentNumber: "STU-DEMO-001", name: "Student A" },
        { studentNumber: "STU-DEMO-002", name: "Student B" },
        { studentNumber: "STU-DEMO-003", name: "Student C" },
      ],
    },
    headers: {
      authorization: `Bearer ${auth.session.access_token}`,
      "x-forwarded-for": "live-grade-test",
    },
    socket: {},
  },
  grade.response,
);
if (
  grade.result.status !== 200 ||
  !Array.isArray(grade.result.body?.rows) ||
  grade.result.body.rows.length < 3 ||
  grade.result.body.requiresHumanReview !== true
)
  throw new Error(
    `Live grade scanning failed with status ${grade.result.status}.`,
  );

await client.auth.signOut();
console.log(
  JSON.stringify({
    chatbot: {
      source: chat.result.body.source,
      citations: chat.result.body.citations.length,
    },
    gradeScan: {
      source: grade.result.body.source,
      rows: grade.result.body.rows.length,
      overallConfidence: grade.result.body.overallConfidence,
      humanReview: grade.result.body.requiresHumanReview,
    },
  }),
);
