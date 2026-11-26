import {assistantFetch,type AssistantTransport} from './assistantTransport';
import {assistantContext} from './assistantContext.js';
import {readAssistantReply} from './assistantStreamReader.js';

export type AssistantFeedbackCapability = { token: string; expiresAt: string };
export type AssistantResponse = {
  modelSettings?:import('./assistantPreferences.js').AssistantPreferences;
  proposedAction?: {kind:'create_task'|'complete_task'|'create_service_request'|'publish_announcement'|'update_display_name'|'set_assignment_status'|'cancel_club_equipment'|'counseling_cancel'|'cancel_facility_repair'|'withdraw_learning_support'|'submit_learning_support'|'create_student_leave_draft'|'invoke_application_api';label:string;payload:Record<string,string>;requestId?:string;url?:string};
  grounding?: {source?:string;webSearched?:boolean;checkedAt?:string;degraded?:boolean};
  verification?: {status:'verified'|'unverified';attempts:number;reason?:string};
  views?: Array<{id:string;title:string;url:string;columns:string[];rows:string[][];total:number;checkedAt:string;note:string}>;
  activity?: Array<{kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'}>;
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
  feedback?: AssistantFeedbackCapability;
};
export type AssistantProgress = NonNullable<AssistantResponse['activity']>[number];

const sessionStorageKey = "stu-public-research-session";
function researchSessionToken() {
  let existing: string|null=null;
  try {existing=window.sessionStorage.getItem(sessionStorageKey)} catch { /* A blocked store must not disable anonymous chat. */ }
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  try {window.sessionStorage.setItem(sessionStorageKey, token)} catch { /* This exchange can use its in-memory token. */ }
  return token;
}

export async function askCampusAssistant(
  question: string,
  history: Array<{role:string;content:string}> = [],
  signal?: AbortSignal,
  images: Array<{name:string;dataUrl:string}> = [],
  route = '',
  onProgress?: (step:AssistantProgress)=>void,
  transport?: AssistantTransport,
): Promise<AssistantResponse> {
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) {
    throw new Error(
      "Please enter a question before sending it to the assistant.",
    );
  }
  const conversation = assistantContext(history);
  const response = await assistantFetch("/api/research-assistant", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: normalizedQuestion,
      history: conversation,
      consentedResearchUse: false,
      sessionToken: researchSessionToken(),
      images,
      route,
      stream:Boolean(onProgress),
    }),
  },transport);
  const payload = (await readAssistantReply(response,onProgress)) as
    (Partial<AssistantResponse> & { error?: string }) | null;
  if (!response.ok)
    throw Object.assign(new Error(payload?.error || "AI 助理目前暫時無法回應。"),{status:response.status});
  if (
    !payload ||
    typeof payload.answer !== "string" ||
    !["answered", "clarification", "abstained", "handoff"].includes(
      String(payload.status),
    ) ||
    !Array.isArray(payload.citations) ||
    (payload.feedback !== undefined && (typeof payload.feedback?.token !== "string" ||
    typeof payload.feedback?.expiresAt !== "string"))
  ) {
    throw new Error("AI 助理收到無效的回應，請稍後再試。");
  }
  return payload as AssistantResponse;
}

/** Explicit knowledge-manager QA. Public chat must never borrow this session. */
export async function askKnowledgeAnswer(question: string): Promise<AssistantResponse> {
  const {supabase} = await import('../utils/supabase');
  const session = supabase ? await supabase.auth.getSession() : null;
  const token=session?.data.session?.access_token;
  if(session?.error || !token) throw new Error('Sign in to the knowledge manager to test restricted sources.');
  const response=await fetch('/api/school-assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({message:question.trim(),mode:'qa',history:[],context:{view:'knowledge-manager'}})});
  const result=await response.json().catch(()=>null) as {answer?:string;error?:string;knowledgeCitations?:AssistantResponse['citations']}|null;
  if(!response.ok||!result?.answer)throw new Error(result?.error||'Knowledge answer testing is unavailable.');
  return {answer:result.answer,status:'answered',citations:result.knowledgeCitations||[],suggestedQuestions:[]};
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
