import { createHash } from "node:crypto";
import { verifySupabaseRequest } from "../server/apiAuth.js";

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};
type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type SchoolRequest = {
  message: string;
  history: ChatMessage[];
  context: Record<string, unknown>;
  agent: AgentState | null;
};

type AgentObservation = {
  step: number;
  actionType: string;
  outcome: "success" | "blocked" | "error";
  summary: string;
};
type AgentState = {
  runId: string;
  goal: string;
  step: number;
  maxSteps: number;
  observations: AgentObservation[];
};

type SchoolAnswer = {
  answer: string;
  suggestedActions: string[];
  citations: string[];
  proposedAction: Record<string, unknown> | null;
  agent: {
    status: "working" | "needs_input" | "complete" | "impossible";
    goalSummary: string;
    stepSummary: string;
    terminalReason: string;
    plan: string[];
    remainingWork: string[];
    clarification: { question: string; reason: string; options: string[] } | null;
  };
};

const requestWindows = new Map<string, number[]>();
const MAX_REQUESTS_PER_MINUTE = 24;
const allowedContextFields = [
  "view",
  "courses",
  "modules",
  "materials",
  "assessments",
  "schedule",
  "announcements",
  "knowledgeTitles",
  "departments",
  "programs",
  "terms",
  "catalogCourses",
  "students",
  "profiles",
  "attendanceRecords",
  "attendanceCorrections",
  "initiatives",
  "curricula",
  "enrollments",
  "materialPages",
  "gradeItems",
  "grades",
  "attendanceSessions",
  "communications",
  "supportRequests",
] as const;
const actionTypes = new Set([
  "navigate",
  "create_module",
  "create_material",
  "create_material_page",
  "create_assessment",
  "create_announcement",
  "create_attendance",
  "create_schedule_event",
  "create_department",
  "create_program",
  "create_academic_term",
  "create_subject",
  "create_section",
  "enroll_student",
  "update_department",
  "update_program",
  "update_academic_term",
  "update_subject",
  "update_section",
  "update_module",
  "delete_module",
  "update_material",
  "delete_material",
  "update_material_page",
  "delete_material_page",
  "delete_assessment",
  "update_announcement",
  "delete_announcement",
  "update_attendance",
  "delete_attendance",
  "update_schedule_event",
  "delete_schedule_event",
  "create_support_request",
  "create_communication_request",
  "request_attendance_correction",
  "decide_attendance_correction",
  "create_initiative",
  "transition_initiative",
  "create_curriculum",
  "mark_learning_progress",
]);
const teachingActionRoles = new Set([
  "owner",
  "admin",
  "dean",
  "department_head",
  "faculty",
]);
const curriculumActionRoles = new Set([
  "owner", "admin", "dean", "registrar", "department_head",
]);
const departmentActionRoles = new Set(["owner", "admin", "dean", "registrar"]);
const academicSetupActionRoles = new Set(["owner", "admin", "dean", "registrar", "department_head"]);
const leadershipActionRoles = new Set(["owner", "admin", "president", "vice_president", "dean", "registrar", "department_head"]);
const allowedActionsByRole: Record<string, Set<string>> = {
  student: new Set(["navigate", "mark_learning_progress"]),
  faculty: new Set(
    [...teachingActionRoles].length
      ? [
          "navigate",
          "create_module",
          "create_material",
          "create_material_page",
          "create_assessment",
          "create_announcement",
          "create_attendance",
          "create_schedule_event",
          "update_module", "delete_module", "update_material", "delete_material",
          "update_material_page", "delete_material_page", "delete_assessment",
          "update_announcement", "delete_announcement", "update_attendance",
          "delete_attendance", "update_schedule_event", "delete_schedule_event",
        ]
      : [],
  ),
};

function allowedActions(role: string) {
  const base = allowedActionsByRole[role]
    ? new Set(allowedActionsByRole[role])
    : teachingActionRoles.has(role)
      ? new Set(allowedActionsByRole.faculty)
      : new Set(["navigate", "create_schedule_event", "update_schedule_event", "delete_schedule_event"]);
  if (curriculumActionRoles.has(role)) base.add("create_curriculum");
  if (departmentActionRoles.has(role)) base.add("create_department");
  if (academicSetupActionRoles.has(role)) {
    for (const action of ["create_program", "create_academic_term", "create_subject", "create_section", "enroll_student", "update_department", "update_program", "update_academic_term", "update_subject", "update_section"]) base.add(action);
  }
  base.add("create_communication_request");
  if (["owner", "admin", "dean", "department_head", "faculty", "advisor", "support", "student"].includes(role)) base.add("create_support_request");
  if (role === "student") base.add("request_attendance_correction");
  if (["owner", "admin", "dean", "department_head", "faculty", "registrar"].includes(role)) base.add("decide_attendance_correction");
  if (leadershipActionRoles.has(role)) {
    base.add("create_initiative");
    base.add("transition_initiative");
  }
  return base;
}

function setHeaders(response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function getClientAddress(request: ApiRequest) {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return value?.trim() || request.socket?.remoteAddress || "unknown";
}

function isRateLimited(identifier: string) {
  const cutoff = Date.now() - 60_000;
  const recent = (requestWindows.get(identifier) ?? []).filter(
    (value) => value > cutoff,
  );
  recent.push(Date.now());
  requestWindows.set(identifier, recent);
  return recent.length > MAX_REQUESTS_PER_MINUTE;
}

function sanitizeContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of allowedContextFields) {
    const item = source[key];
    if (typeof item === "string") safe[key] = item.trim().slice(0, 1_000);
    if (Array.isArray(item)) {
      const entries: unknown[] = [];
      for (const entry of item.slice(0, 30)) {
        if (typeof entry === "string") {
          entries.push(entry.slice(0, 300));
          continue;
        }
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
          continue;
        const record = entry as Record<string, unknown>;
        const clean: Record<string, string> = {};
        for (const field of ["id", "sectionId", "moduleId", "departmentId", "programId", "termId", "courseId", "studentId", "attendanceRecordId", "ownerId", "code", "title", "name", "studentNumber", "status", "role", "operation"]) {
          if (typeof record[field] === "string")
            clean[field] = record[field].slice(0, 180);
        }
        if (Object.keys(clean).length) entries.push(clean);
      }
      safe[key] = entries;
    }
  }
  return safe;
}

function parseBody(body: unknown): SchoolRequest | null {
  let candidate = body;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const value = candidate as Record<string, unknown>;
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message || message.length > 2_500) return null;
  const history = Array.isArray(value.history)
    ? value.history.slice(-12).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
          return [];
        const item = entry as Record<string, unknown>;
        if (
          (item.role !== "user" && item.role !== "assistant") ||
          typeof item.content !== "string"
        )
          return [];
        return [
          {
            role: item.role,
            content: item.content.trim().slice(0, 3_000),
          } satisfies ChatMessage,
        ];
      })
    : [];
  let agent: AgentState | null = null;
  if (value.agent && typeof value.agent === "object" && !Array.isArray(value.agent)) {
    const raw = value.agent as Record<string, unknown>;
    const runId = typeof raw.runId === "string" ? raw.runId.slice(0, 120) : "";
    const goal = typeof raw.goal === "string" ? raw.goal.trim().slice(0, 2_500) : "";
    const step = Number.isInteger(raw.step) ? Math.max(0, Math.min(8, Number(raw.step))) : 0;
    const maxSteps = Number.isInteger(raw.maxSteps) ? Math.max(1, Math.min(8, Number(raw.maxSteps))) : 8;
    const observations = Array.isArray(raw.observations)
      ? raw.observations.slice(-8).flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const item = entry as Record<string, unknown>;
          if (!Number.isInteger(item.step) || typeof item.actionType !== "string" ||
              !["success", "blocked", "error"].includes(String(item.outcome)) || typeof item.summary !== "string") return [];
          return [{
            step: Math.max(0, Math.min(8, Number(item.step))),
            actionType: item.actionType.slice(0, 80),
            outcome: item.outcome as AgentObservation["outcome"],
            summary: item.summary.trim().slice(0, 600),
          }];
        })
      : [];
    if (runId && goal) agent = { runId, goal, step, maxSteps, observations };
  }
  return { message, history, context: sanitizeContext(value.context), agent };
}

function outputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function parseOutput(payload: unknown): SchoolAnswer | null {
  try {
    const candidate = JSON.parse(outputText(payload)) as Record<
      string,
      unknown
    >;
    if (
      typeof candidate.answer !== "string" ||
      !Array.isArray(candidate.suggestedActions) ||
      !Array.isArray(candidate.citations) ||
      !candidate.agent || typeof candidate.agent !== "object" || Array.isArray(candidate.agent)
    )
      return null;
    if (
      !candidate.suggestedActions.every((item) => typeof item === "string") ||
      !candidate.citations.every((item) => typeof item === "string")
    )
      return null;
    const rawAction = candidate.proposedAction;
    const proposedAction =
      rawAction &&
      typeof rawAction === "object" &&
      !Array.isArray(rawAction) &&
      actionTypes.has((rawAction as Record<string, unknown>).type as string)
        ? (rawAction as Record<string, unknown>)
        : null;
    const rawAgent = candidate.agent as Record<string, unknown>;
    if (!["working", "needs_input", "complete", "impossible"].includes(String(rawAgent.status)) ||
        typeof rawAgent.goalSummary !== "string" || typeof rawAgent.stepSummary !== "string" ||
        typeof rawAgent.terminalReason !== "string" || !Array.isArray(rawAgent.plan) ||
        !rawAgent.plan.every((item)=>typeof item === "string") || !Array.isArray(rawAgent.remainingWork) ||
        !rawAgent.remainingWork.every((item)=>typeof item === "string")) return null;
    const rawClarification=rawAgent.clarification;
    const clarification=rawClarification && typeof rawClarification === "object" && !Array.isArray(rawClarification) &&
      typeof (rawClarification as Record<string,unknown>).question === "string" &&
      typeof (rawClarification as Record<string,unknown>).reason === "string" &&
      Array.isArray((rawClarification as Record<string,unknown>).options) &&
      ((rawClarification as Record<string,unknown>).options as unknown[]).every((item)=>typeof item === "string")
      ? {question:String((rawClarification as Record<string,unknown>).question).slice(0,500),reason:String((rawClarification as Record<string,unknown>).reason).slice(0,500),options:((rawClarification as Record<string,unknown>).options as string[]).slice(0,4).map((item)=>item.slice(0,160))}
      : null;
    return {
      answer: candidate.answer.trim().slice(0, 7_500),
      suggestedActions: candidate.suggestedActions
        .slice(0, 5)
        .map((item) => item.slice(0, 500)),
      citations: candidate.citations
        .slice(0, 8)
        .map((item) => item.slice(0, 300)),
      proposedAction,
      agent: {
        status: rawAgent.status as SchoolAnswer["agent"]["status"],
        goalSummary: rawAgent.goalSummary.trim().slice(0, 500),
        stepSummary: rawAgent.stepSummary.trim().slice(0, 1_000),
        terminalReason: rawAgent.terminalReason.trim().slice(0, 1_000),
        plan: (rawAgent.plan as string[]).slice(0,12).map((item)=>item.slice(0,300)),
        remainingWork: (rawAgent.remainingWork as string[]).slice(0,12).map((item)=>item.slice(0,300)),
        clarification,
      },
    };
  } catch {
    return null;
  }
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
) {
  setHeaders(response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const input = parseBody(request.body);
  if (!input) {
    response.status(400).json({ error: "A valid message is required." });
    return;
  }

  const auth = await verifySupabaseRequest(request);
  if (auth.ok === false) {
    response.status(auth.status).json({ error: auth.message });
    return;
  }

  const clientAddress = getClientAddress(request);
  if (isRateLimited(`${auth.user.id}:${clientAddress}`)) {
    response.status(429).json({
      error: "Too many requests. Please wait a moment and try again.",
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "AI service is not configured." });
    return;
  }

  const safetyIdentifier = createHash("sha256")
    .update(`${process.env.SAFETY_HASH_SALT || "stu-nexus"}:${auth.user.id}`)
    .digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const roleInstruction =
      auth.user.role === "student"
        ? "Support the learner with explanations, study planning, course navigation, and formative guidance. Do not complete graded work for them; teach the reasoning instead."
        : auth.user.role === "faculty"
          ? "Support teaching, lesson preparation, assessment quality, feedback drafting, schedule planning, and evidence-based student support. Never publish or finalize a grade."
          : "Support authorized school operations, planning, policy-grounded answers, and responsible coordination. High-impact actions require human confirmation.";

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        instructions: [
          "You are Nexus, the role-aware conversational assistant inside the Shu-Te University operating platform.",
          roleInstruction,
          "Use only the bounded platform context and conversation supplied. Never invent a university policy, date, grade, student fact, or authorization.",
          "Protect privacy. Do not request passwords, authentication tokens, diagnoses, or unnecessary sensitive personal data.",
          "Work autonomously from the supplied platform context. Before asking the user anything, inspect all relevant departments, programs, curricula, subjects, classes, people, enrollments, learning records, schedules, and prior observations; infer harmless defaults from institutional context and the user's stated goal. Never ask for information that is already present or can be safely inferred.",
          `The only executable actions for this role are: ${[...allowedActions(auth.user.role)].join(", ")}. You are operating a persistent bounded goal loop. Maintain a concise end-to-end plan and remainingWork. Choose exactly one next executable action per response, use exact IDs from platform context, and reassess the whole goal after every real observation. A successful action is only one step: keep status working and propose the next action while remainingWork is non-empty. Set complete only when every requested outcome is proven satisfied and remainingWork is empty. Set impossible only for a genuine capability, authority, safety, or repeated-error boundary—not merely missing optional detail. Never repeat an already successful action and never claim an action happened until its success observation is supplied. For create_assessment with assessmentType quiz or exam, include at least one complete question with a prompt, positive points, at least two options, a one-based correctOption between 1 and the number of options, and an explanation. For assignments and projects, questions may be empty. Treat a user's correction or execution-error observation as authoritative: change the rejected parameter values, verify the complete payload against the observation, and never return an unchanged rejected proposal.`,
          "If a required decision cannot be inferred safely and materially changes the result, set status needs_input, return no proposedAction, and provide one focused clarification object with a question, short reason, and two to four concrete options. Do not put ordinary questions in answer. Once the user's clarification appears in observations, continue the same plan and run rather than starting over.",
          `For an authorized request to create a complete degree curriculum, use one create_curriculum action rather than dozens of small actions. Always include every required curriculum field: programCode, programName, description, durationYears, effectiveYear as a four-digit integer, subjects, and blocks. If the user does not state an effective year, infer ${new Date().getUTCFullYear()} for the unpublished draft instead of stopping to ask. Produce a coherent, realistic draft with every subject placed by year and semester, unique institutional subject codes, units, ordered prerequisites that refer only to earlier subjects in the same payload, and at least one block template for every year. This is a draft requiring human academic and regulatory review; never claim accreditation approval.`,
          "When an authorized owner, administrator, dean, or registrar explicitly asks you to add a missing academic department, use create_department with a short unique uppercase code in code, the complete department name in title, and its purpose in description. After the confirmed success observation, continue the original goal using the newly returned record ID and refreshed platform context.",
          "Academic setup tools: create_program uses departmentId, code, title, description, level, and durationYears; create_academic_term uses code, title, startsAt, endsAt, and status; create_subject uses departmentId, optional programId, code, title, description, and credits; create_section uses courseId, termId, code as the section code, optional facultyId, modality, room, capacity, and status; enroll_student uses sectionId, studentId, and status. Use exact IDs from refreshed context, propose one confirmed mutation at a time, then continue automatically after its real success observation until the complete requested workflow is achieved.",
          "For update_* actions, include the exact existing target ID and the complete replacement values required by that record. For delete_* actions, include the exact target ID and clearly describe the irreversible effect in confirmation. Never delete an assessment with attempts; the repository enforces that boundary. Learning material pages use targetId; modules use moduleId; materials use materialId; announcements, attendance sessions, schedule events, and assessments use targetId.",
          "Service tools: create_support_request uses studentId, title, code as category, description, and priority; create_communication_request uses recipientId, title as subject, content as body; request_attendance_correction uses attendanceRecordId, status as the requested status, and reason; decide_attendance_correction uses requestId, approve, and reason; create_initiative uses operation as policy/initiative/teaching_plan/content_correction, title, description, content as scope, priority, and dueAt; transition_initiative uses initiativeId, operation as approve/assign/complete/reject/escalate, optional ownerId, and reason.",
          auth.user.role === "student"
            ? "Absolute student boundary: never answer, select answers for, complete, modify, grade, or submit an assignment, quiz, exam, project, or other assessed work. Never create an assessment action for a student. You may explain concepts, navigate, and mark a learning material in progress or completed only when the student explicitly asks."
            : "Never change roles, credentials, student identity records, or publish/finalize grades through this assistant. Enrollment changes are permitted only through the explicit enroll_student tool for an authorized academic operator.",
          "Return JSON exactly matching the schema. Citations must name a supplied course, schedule, knowledge item, or clearly state Platform context.",
        ].join(" "),
        input: [
          ...input.history.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          {
            role: "user",
            content: JSON.stringify({
              question: input.message,
              agent_goal: input.agent?.goal ?? input.message,
              agent_state: input.agent ?? {
                runId: "chat",
                goal: input.message,
                step: 0,
                maxSteps: 32,
                observations: [],
              },
              trusted_role: auth.user.role,
              platform_context: input.context,
            }),
          },
        ],
        reasoning: { effort: "low" },
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "stu_nexus_chat_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                suggestedActions: {
                  type: "array",
                  minItems: 0,
                  maxItems: 5,
                  items: { type: "string" },
                },
                citations: {
                  type: "array",
                  minItems: 1,
                  maxItems: 8,
                  items: { type: "string" },
                },
                proposedAction: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "none",
                        "navigate",
                        "create_module",
                        "create_material",
                        "create_material_page",
                        "create_assessment",
                        "create_announcement",
                        "create_attendance",
                        "create_schedule_event",
                        "create_department",
                        "create_program",
                        "create_academic_term",
                        "create_subject",
                        "create_section",
                        "enroll_student",
                        "update_department",
                        "update_program",
                        "update_academic_term",
                        "update_subject",
                        "update_section",
                        "update_module",
                        "delete_module",
                        "update_material",
                        "delete_material",
                        "update_material_page",
                        "delete_material_page",
                        "delete_assessment",
                        "update_announcement",
                        "delete_announcement",
                        "update_attendance",
                        "delete_attendance",
                        "update_schedule_event",
                        "delete_schedule_event",
                        "create_support_request",
                        "create_communication_request",
                        "request_attendance_correction",
                        "decide_attendance_correction",
                        "create_initiative",
                        "transition_initiative",
                        "create_curriculum",
                        "mark_learning_progress",
                      ],
                    },
                    confirmation: { type: "string" },
                    code: { type: "string" },
                    targetId: { type: ["string", "null"] },
                    sectionId: { type: ["string", "null"] },
                    moduleId: { type: ["string", "null"] },
                    materialId: { type: ["string", "null"] },
                    departmentId: { type: ["string", "null"] },
                    programId: { type: ["string", "null"] },
                    termId: { type: ["string", "null"] },
                    courseId: { type: ["string", "null"] },
                    studentId: { type: ["string", "null"] },
                    facultyId: { type: ["string", "null"] },
                    recipientId: { type: ["string", "null"] },
                    requestId: { type: ["string", "null"] },
                    initiativeId: { type: ["string", "null"] },
                    ownerId: { type: ["string", "null"] },
                    attendanceRecordId: { type: ["string", "null"] },
                    destination: {
                      type: ["string", "null"],
                      enum: [
                        "home",
                        "academics",
                        "learning",
                        "teaching",
                        "assessments",
                        "grades",
                        "schedule",
                        "people",
                        "crm",
                        null,
                      ],
                    },
                    title: { type: "string" },
                    description: { type: "string" },
                    content: { type: "string" },
                    materialType: {
                      type: ["string", "null"],
                      enum: ["lesson", "link", "video", "activity", null],
                    },
                    externalUrl: { type: ["string", "null"] },
                    minutes: { type: ["number", "null"] },
                    required: { type: ["boolean", "null"] },
                    assessmentType: {
                      type: ["string", "null"],
                      enum: ["quiz", "exam", "assignment", "project", null],
                    },
                    questions: {
                      type: "array",
                      maxItems: 50,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          prompt: { type: "string" },
                          points: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
                          options: { type: "array", maxItems: 12, items: { type: "string" } },
                          correctOption: { type: "integer", minimum: 1, maximum: 12 },
                          explanation: { type: "string" },
                        },
                        required: ["prompt", "points", "options", "correctOption", "explanation"],
                      },
                    },
                    dueAt: { type: ["string", "null"] },
                    maxScore: { type: ["number", "null"] },
                    priority: {
                      type: ["string", "null"],
                      enum: ["normal", "important", "urgent", null],
                    },
                    startsAt: { type: ["string", "null"] },
                    endsAt: { type: ["string", "null"] },
                    location: { type: ["string", "null"] },
                    completed: { type: ["boolean", "null"] },
                    durationYears: { type: ["number", "null"] },
                    credits: { type: ["number", "null"] },
                    capacity: { type: ["number", "null"] },
                    level: { type: "string" },
                    modality: { type: "string" },
                    room: { type: "string" },
                    status: { type: "string" },
                    operation: { type: "string" },
                    reason: { type: "string" },
                    approve: { type: ["boolean", "null"] },
                    publish: { type: "boolean" },
                    curriculum: {
                      anyOf: [
                        { type: "null" },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            programCode: { type: "string" },
                            programName: { type: "string" },
                            description: { type: "string" },
                            durationYears: { type: "integer", minimum: 1, maximum: 8 },
                            effectiveYear: { type: "integer", minimum: 2000, maximum: 2200 },
                            subjects: {
                              type: "array",
                              minItems: 8,
                              maxItems: 120,
                              items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                  code: { type: "string" },
                                  title: { type: "string" },
                                  description: { type: "string" },
                                  units: { type: "number", exclusiveMinimum: 0, maximum: 12 },
                                  yearLevel: { type: "integer", minimum: 1, maximum: 8 },
                                  semester: { type: "integer", minimum: 1, maximum: 3 },
                                  category: { type: "string", enum: ["general_education", "core", "professional", "elective", "capstone", "internship", "physical_education", "nstp"] },
                                  sortOrder: { type: "integer", minimum: 1, maximum: 120 },
                                  prerequisiteCodes: { type: "array", maxItems: 12, items: { type: "string" } },
                                },
                                required: ["code", "title", "description", "units", "yearLevel", "semester", "category", "sortOrder", "prerequisiteCodes"],
                              },
                            },
                            blocks: {
                              type: "array",
                              minItems: 1,
                              maxItems: 32,
                              items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                  yearLevel: { type: "integer", minimum: 1, maximum: 8 },
                                  blockCode: { type: "string" },
                                  capacity: { type: "integer", minimum: 1, maximum: 500 },
                                },
                                required: ["yearLevel", "blockCode", "capacity"],
                              },
                            },
                          },
                          required: ["programCode", "programName", "description", "durationYears", "effectiveYear", "subjects", "blocks"],
                        },
                      ],
                    },
                  },
                  required: [
                    "type",
                    "confirmation",
                    "code",
                    "targetId",
                    "sectionId",
                    "moduleId",
                    "materialId",
                    "departmentId",
                    "programId",
                    "termId",
                    "courseId",
                    "studentId",
                    "facultyId",
                    "recipientId",
                    "requestId",
                    "initiativeId",
                    "ownerId",
                    "attendanceRecordId",
                    "destination",
                    "title",
                    "description",
                    "content",
                    "materialType",
                    "externalUrl",
                    "minutes",
                    "required",
                    "assessmentType",
                    "questions",
                    "dueAt",
                    "maxScore",
                    "priority",
                    "startsAt",
                    "endsAt",
                    "location",
                    "completed",
                    "durationYears",
                    "credits",
                    "capacity",
                    "level",
                    "modality",
                    "room",
                    "status",
                    "operation",
                    "reason",
                    "approve",
                    "publish",
                    "curriculum",
                  ],
                },
                agent: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    status: { type: "string", enum: ["working", "needs_input", "complete", "impossible"] },
                    goalSummary: { type: "string" },
                    stepSummary: { type: "string" },
                    terminalReason: { type: "string" },
                    plan: { type: "array", maxItems: 12, items: { type: "string" } },
                    remainingWork: { type: "array", maxItems: 12, items: { type: "string" } },
                    clarification: {
                      anyOf: [
                        { type: "null" },
                        { type: "object", additionalProperties: false, properties: {
                          question: { type: "string" }, reason: { type: "string" },
                          options: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
                        }, required: ["question","reason","options"] },
                      ],
                    },
                  },
                  required: ["status", "goalSummary", "stepSummary", "terminalReason", "plan", "remainingWork", "clarification"],
                },
              },
              required: [
                "answer",
                "suggestedActions",
                "citations",
                "proposedAction",
                "agent",
              ],
            },
          },
        },
        max_output_tokens: 14_000,
        safety_identifier: safetyIdentifier,
        store: false,
      }),
      signal: controller.signal,
    });
    if (!openAiResponse.ok) {
      response
        .status(openAiResponse.status === 429 ? 429 : 502)
        .json({ error: "Nexus AI is temporarily unavailable." });
      return;
    }
    const result = parseOutput((await openAiResponse.json()) as unknown);
    if (!result) {
      response
        .status(502)
        .json({ error: "Nexus AI returned an invalid response." });
      return;
    }
    const roleAllowedAction = result.proposedAction &&
      allowedActions(auth.user.role).has(String(result.proposedAction.type))
      ? result.proposedAction : null;
    let agent = result.agent;
    if (agent.status === "complete" && agent.remainingWork.length)
      agent = { ...agent, status: "working", terminalReason: "" };
    if (agent.status === "needs_input" && !agent.clarification)
      agent = { ...agent, status: "impossible", terminalReason: "Nexus could not identify the exact decision required to continue." };
    if (agent.status === "working" && !roleAllowedAction)
      agent = agent.clarification
        ? { ...agent, status: "needs_input", terminalReason: "" }
        : { ...agent, status: "impossible", terminalReason: agent.terminalReason || "No permitted next action was available, so Nexus stopped safely." };
    response.status(200).json({
      ...result,
      agent,
      proposedAction: agent.status === "working" ? roleAllowedAction : null,
      source: "openai",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    response.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "Nexus AI timed out."
        : "Nexus AI is temporarily unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
