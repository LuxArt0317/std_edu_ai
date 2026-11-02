import { supabase } from "../../utils/supabase";
import type {
  ChatMessage,
  GradeScanResult,
  PlatformData,
  SchoolAiAction,
  SchoolAgentRequestState,
  SchoolChatAnswer,
} from "./types";

export type NexusInputAttachment={name:string;mimeType:string;size:number;dataUrl:string};

async function accessToken() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error(
      "Your STU Nexus session has expired. Please sign in again.",
    );
  return data.session.access_token;
}

export async function askSchoolAssistant(
  message: string,
  history: ChatMessage[],
  context: { view: string; data: PlatformData },
  agent?: SchoolAgentRequestState,
  mode: "qa"|"agentic" = "agentic",
  attachments: NexusInputAttachment[] = [],
): Promise<SchoolChatAnswer> {
  const token = await accessToken();
  const response = await fetch("/api/school-assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      history: history
        .filter((item) => item.role !== "system")
        .slice(-12)
        .map((item) => ({ role: item.role, content: item.content })),
      // Facts are fetched with this session's JWT on the server. The browser
      // supplies only the current view, never authoritative account records.
      context: { view: context.view },
      agent,
      mode,
      attachments:attachments.map((item)=>({name:item.name,mimeType:item.mimeType,size:item.size,dataUrl:item.dataUrl})),
    }),
  });
  const payload = (await response.json()) as Partial<SchoolChatAnswer> & {
    error?: string;
  };
  if (
    !response.ok ||
    !payload.answer ||
    !Array.isArray(payload.suggestedActions) ||
    !Array.isArray(payload.citations)
  )
    throw new Error(payload.error || "Nexus AI is unavailable.");
  return {
    answer: payload.answer,
    suggestedActions: payload.suggestedActions,
    citations: payload.citations,
    proposedAction: (payload.proposedAction ?? null) as SchoolAiAction | null,
    agent: payload.agent ?? {
      status: payload.proposedAction ? "working" : "complete",
      goalSummary: message,
      stepSummary: payload.answer,
      terminalReason: "",
      plan: [],
      remainingWork: [],
      clarification: null,
    },
    source: "openai",
  };
}

export async function recordSchoolAgentAction(
  actionType: SchoolAiAction["type"],
  outcome: "success" | "blocked" | "error",
) {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("ai_audit_logs").insert({
      user_id: data.user.id,
      use_case: "action",
      model: "openai-responses",
      context_fields: [`action:${actionType}`],
      output_citations: [],
      outcome,
    });
  } catch {
    // The authorized operation is not rolled back when telemetry is unavailable.
  }
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The selected image could not be read."));
    reader.onerror = () =>
      reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

export async function scanGradeSheet(
  file: File,
  title: string,
  maxScore: number,
  roster: PlatformData["students"],
): Promise<GradeScanResult> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 7_500_000)
    throw new Error("The grade-sheet image must be smaller than 7.5 MB.");
  const token = await accessToken();
  const imageDataUrl = await readAsDataUrl(file);
  const response = await fetch("/api/grade-scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      imageDataUrl,
      title,
      maxScore,
      roster: roster.map((student) => ({
        studentNumber: student.studentNumber,
        name: student.name,
      })),
    }),
  });
  const payload = (await response.json()) as GradeScanResult & {
    error?: string;
  };
  if (!response.ok || !Array.isArray(payload.rows))
    throw new Error(payload.error || "The grade sheet could not be scanned.");
  return payload;
}
