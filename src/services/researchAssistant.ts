export type AssistantFeedbackCapability = { token: string; expiresAt: string };
export type AssistantResponse = {
  answer: string;
  status: "answered" | "clarification" | "abstained" | "handoff";
  citations: Array<{
    chunkId: string;
    claim: string;
    title: string;
    sourceName: string;
    url: string;
    locator: string | null;
    effectiveAt: string | null;
    reviewedAt: string | null;
  }>;
  suggestedQuestions: string[];
  feedback: AssistantFeedbackCapability;
};

const sessionStorageKey = "stu-public-research-session";
function researchSessionToken() {
  const existing = window.sessionStorage.getItem(sessionStorageKey);
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  window.sessionStorage.setItem(sessionStorageKey, token);
  return token;
}

export async function askCampusAssistant(
  question: string,
): Promise<AssistantResponse> {
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) {
    throw new Error(
      "Please enter a question before sending it to the assistant.",
    );
  }
  const response = await fetch("/api/research-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: normalizedQuestion,
      consentedResearchUse: false,
      sessionToken: researchSessionToken(),
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    (Partial<AssistantResponse> & { error?: string }) | null;
  if (!response.ok)
    throw new Error(payload?.error || "AI 助理目前暫時無法回應。");
  if (
    !payload ||
    typeof payload.answer !== "string" ||
    !["answered", "clarification", "abstained", "handoff"].includes(
      String(payload.status),
    ) ||
    !Array.isArray(payload.citations) ||
    typeof payload.feedback?.token !== "string" ||
    typeof payload.feedback?.expiresAt !== "string"
  ) {
    throw new Error("AI 助理收到無效的回應，請稍後再試。");
  }
  return payload as AssistantResponse;
}

export async function submitAssistantFeedback(input: {
  capability: AssistantFeedbackCapability;
  helpful: boolean;
  resolvedNeed?: boolean | null;
  correctionCategory?:
    | "incorrect"
    | "stale"
    | "missing_source"
    | "unclear"
    | "unsafe"
    | "wrong_route"
    | "other"
    | null;
  comment?: string;
}) {
  const response = await fetch("/api/research-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      feedbackToken: input.capability.token,
      sessionToken: researchSessionToken(),
      helpful: input.helpful,
      resolvedNeed: input.resolvedNeed ?? null,
      correctionCategory: input.correctionCategory ?? null,
      comment: input.comment?.trim() || "",
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    status?: string;
  } | null;
  if (!response.ok || payload?.status !== "recorded")
    throw new Error(payload?.error || "Feedback could not be recorded.");
}
