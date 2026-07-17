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
};

type SchoolAnswer = {
  answer: string;
  suggestedActions: string[];
  citations: string[];
  proposedAction: Record<string, unknown> | null;
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
  "mark_learning_progress",
]);
const teachingActionRoles = new Set([
  "owner",
  "admin",
  "dean",
  "department_head",
  "faculty",
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
  if (allowedActionsByRole[role]) return allowedActionsByRole[role];
  if (teachingActionRoles.has(role)) return allowedActionsByRole.faculty;
  return new Set(["navigate", "create_schedule_event"]);
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
        for (const field of ["id", "sectionId", "moduleId", "code", "title"]) {
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
  return { message, history, context: sanitizeContext(value.context) };
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
      !Array.isArray(candidate.citations)
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
    return {
      answer: candidate.answer.trim().slice(0, 7_500),
      suggestedActions: candidate.suggestedActions
        .slice(0, 5)
        .map((item) => item.slice(0, 500)),
      citations: candidate.citations
        .slice(0, 8)
        .map((item) => item.slice(0, 300)),
      proposedAction,
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
  const timeout = setTimeout(() => controller.abort(), 28_000);
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
          `The only executable actions for this role are: ${[...allowedActions(auth.user.role)].join(", ")}. Propose at most one action and only when explicitly requested. Use exact IDs from platform context. Never claim it already happened; the application requires confirmation and revalidates authorization.`,
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
                        "mark_learning_progress",
                      ],
                    },
                    confirmation: { type: "string" },
                    targetId: { type: ["string", "null"] },
                    sectionId: { type: ["string", "null"] },
                    moduleId: { type: ["string", "null"] },
                    materialId: { type: ["string", "null"] },
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
                  },
                  required: [
                    "type",
                    "confirmation",
                    "targetId",
                    "sectionId",
                    "moduleId",
                    "materialId",
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
                  ],
                },
              },
              required: [
                "answer",
                "suggestedActions",
                "citations",
                "proposedAction",
              ],
            },
          },
        },
        max_output_tokens: 1_400,
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
    response.status(200).json({
      ...result,
      proposedAction:
        result.proposedAction &&
        allowedActions(auth.user.role).has(String(result.proposedAction.type))
          ? result.proposedAction
          : null,
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
