export const assistantApi = {"description":"Save a user feedback report about an assistant response. Validated by the existing feedback endpoint.","methods":["POST"],"readMethods":[]};
import { createHash } from "node:crypto";

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

const correctionCategories = new Set([
  "incorrect",
  "stale",
  "missing_source",
  "unclear",
  "unsafe",
  "wrong_route",
  "other",
]);
const windows = new Map<string, number[]>();
export const config = { maxDuration: 15 };

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function address(request: ApiRequest) {
  return (
    header(request.headers["x-forwarded-for"])?.split(",")[0].trim() ||
    request.socket?.remoteAddress ||
    "unknown"
  );
}
function rateLimited(key: string) {
  const cutoff = Date.now() - 60_000;
  const active = (windows.get(key) || []).filter((time) => time > cutoff);
  active.push(Date.now());
  windows.set(key, active);
  if (windows.size > 10_000)
    for (const [id, times] of windows)
      if (!times.some((time) => time > cutoff)) windows.delete(id);
  return active.length > 8;
}
function parse(body: unknown) {
  let candidate = body;
  if (typeof body === "string") {
    try {
      candidate = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const value = candidate as Record<string, unknown>;
  const feedbackToken =
    typeof value.feedbackToken === "string" ? value.feedbackToken : "";
  const sessionToken =
    typeof value.sessionToken === "string" ? value.sessionToken : "";
  const helpful = value.helpful;
  const resolvedNeed =
    typeof value.resolvedNeed === "boolean" ? value.resolvedNeed : null;
  const correctionCategory =
    typeof value.correctionCategory === "string" && value.correctionCategory
      ? value.correctionCategory
      : null;
  const comment = typeof value.comment === "string" ? value.comment.trim() : "";
  if (
    !/^[0-9a-f]{64}$/.test(feedbackToken) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(sessionToken) ||
    typeof helpful !== "boolean" ||
    (correctionCategory !== null &&
      !correctionCategories.has(correctionCategory)) ||
    comment.length > 1_000
  )
    return null;
  return {
    feedbackToken,
    sessionToken,
    helpful,
    resolvedNeed,
    correctionCategory,
    comment,
  };
}
function headers(response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
) {
  headers(response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  const input = parse(request.body);
  if (!input) {
    response.status(400).json({ error: "Valid answer feedback is required." });
    return;
  }
  const clientAddress = address(request);
  if (rateLimited(clientAddress)) {
    response
      .status(429)
      .json({ error: "Too many feedback attempts. Please try again later." });
    return;
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) {
    response.status(503).json({ error: "Feedback is not configured." });
    return;
  }
  const sessionHash = createHash("sha256")
    .update(
      `${process.env.SAFETY_HASH_SALT || "stu-public"}:${input.sessionToken}`,
    )
    .digest("hex");
  const result = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/submit_public_ai_feedback`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_feedback_token: input.feedbackToken,
        p_session_hash: sessionHash,
        p_helpful: input.helpful,
        p_resolved_need: input.resolvedNeed,
        p_correction_category: input.correctionCategory,
        p_comment: input.comment || null,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!result.ok) {
    response.status(result.status === 429 ? 429 : 400).json({
      error:
        "This feedback link is invalid, expired, or has already been submitted.",
    });
    return;
  }
  response.status(201).json({ status: "recorded" });
}
