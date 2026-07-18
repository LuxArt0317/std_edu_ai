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
    status: "working" | "complete" | "impossible";
    goalSummary: string;
    stepSummary: string;
    terminalReason: string;
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
        ]
      : [],
  ),
};

function allowedActions(role: string) {
  const base = allowedActionsByRole[role]
    ? new Set(allowedActionsByRole[role])
    : teachingActionRoles.has(role)
      ? new Set(allowedActionsByRole.faculty)
      : new Set(["navigate", "create_schedule_event"]);
  if (curriculumActionRoles.has(role)) base.add("create_curriculum");
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
        for (const field of ["id", "sectionId", "moduleId", "code", "title", "name"]) {
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
    if (!["working", "complete", "impossible"].includes(String(rawAgent.status)) ||
        typeof rawAgent.goalSummary !== "string" || typeof rawAgent.stepSummary !== "string" ||
        typeof rawAgent.terminalReason !== "string") return null;
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
          "When context is insufficient, say what is missing and give the safest useful next step.",
          `The only executable actions for this role are: ${[...allowedActions(auth.user.role)].join(", ")}. You are operating a bounded goal loop. Choose at most one next action per response, use exact IDs from platform context, and reassess the goal from the supplied real observations. Set agent.status to working only when a permitted next action is necessary. Set complete only when the requested goal is satisfied. Set impossible when required information, authority, capability, or a prior blocked/error observation makes completion unsafe or unavailable. Never repeat an already successful action. Never claim an action happened until its success observation is supplied.`,
          "For an authorized request to create a complete degree curriculum, use one create_curriculum action rather than dozens of small actions. Produce a coherent, realistic draft with every subject placed by year and semester, unique institutional subject codes, units, ordered prerequisites that refer only to earlier subjects in the same payload, and at least one block template for every year. This is a draft requiring human academic and regulatory review; never claim accreditation approval.",
          auth.user.role === "student"
            ? "Absolute student boundary: never answer, select answers for, complete, modify, grade, or submit an assignment, quiz, exam, project, or other assessed work. Never create an assessment action for a student. You may explain concepts, navigate, and mark a learning material in progress or completed only when the student explicitly asks."
            : "Never change roles, credentials, enrollments, student identity records, or publish/finalize grades through this assistant.",
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
                maxSteps: 8,
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
                        "create_curriculum",
                        "mark_learning_progress",
                      ],
                    },
                    confirmation: { type: "string" },
                    targetId: { type: ["string", "null"] },
                    sectionId: { type: ["string", "null"] },
                    moduleId: { type: ["string", "null"] },
                    materialId: { type: ["string", "null"] },
                    departmentId: { type: ["string", "null"] },
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
                    "targetId",
                    "sectionId",
                    "moduleId",
                    "materialId",
                    "departmentId",
                    "destination",
                    "title",
                    "description",
                    "content",
                    "materialType",
                    "externalUrl",
                    "minutes",
                    "required",
                    "assessmentType",
                    "dueAt",
                    "maxScore",
                    "priority",
                    "startsAt",
                    "endsAt",
                    "location",
                    "completed",
                    "publish",
                    "curriculum",
                  ],
                },
                agent: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    status: { type: "string", enum: ["working", "complete", "impossible"] },
                    goalSummary: { type: "string" },
                    stepSummary: { type: "string" },
                    terminalReason: { type: "string" },
                  },
                  required: ["status", "goalSummary", "stepSummary", "terminalReason"],
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
    const agent = result.agent.status === "working" && !roleAllowedAction
      ? { ...result.agent, status: "impossible" as const,
          terminalReason: result.agent.terminalReason || "No permitted next action was available, so Nexus stopped safely." }
      : result.agent;
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
