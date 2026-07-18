import type {
  SchoolAgentObservation,
  SchoolAgentStatus,
  SchoolAiAction,
} from "./types.ts";

export const SCHOOL_AGENT_MAX_STEPS = 32;
export const SCHOOL_AGENT_MAX_RUNTIME_MS = 30 * 60_000;

export type SchoolAgentRun = {
  id: string;
  goal: string;
  status: SchoolAgentStatus | "awaiting_confirmation" | "awaiting_input" | "cancelled";
  step: number;
  maxSteps: number;
  startedAt: number;
  observations: SchoolAgentObservation[];
  actionFingerprints: string[];
  summary: string;
  terminalReason: string;
  plan: string[];
  remainingWork: string[];
  clarification: { question: string; reason: string; options: string[] } | null;
};

export function startSchoolAgentRun(goal: string, now = Date.now()): SchoolAgentRun {
  return {
    // This identifier is telemetry/idempotency metadata, not a security token.
    // Avoid WebKit's inconsistent randomUUID implementation, which can throw a
    // generic DOM pattern SyntaxError in otherwise valid authenticated sessions.
    id: `agent-${now}-${Math.random().toString(36).slice(2, 12)}`,
    goal: goal.trim().slice(0, 2_500),
    status: "working",
    step: 0,
    maxSteps: SCHOOL_AGENT_MAX_STEPS,
    startedAt: now,
    observations: [],
    actionFingerprints: [],
    summary: "Understanding the goal and choosing the safest next step.",
    terminalReason: "",
    plan: [],
    remainingWork: [],
    clarification: null,
  };
}

export function actionFingerprint(action: SchoolAiAction) {
  return JSON.stringify([
    action.type,
    action.targetId,
    action.sectionId,
    action.moduleId,
    action.materialId,
    action.destination,
    action.title,
  ]);
}

export function runSafetyStop(run: SchoolAgentRun, now = Date.now()) {
  if (run.step >= run.maxSteps)
    return `Stopped safely after ${run.maxSteps} steps. Split the goal into a smaller request to continue.`;
  if (now - run.startedAt > SCHOOL_AGENT_MAX_RUNTIME_MS)
    return "Stopped safely because this goal exceeded the thirty-minute runtime limit.";
  const recent = run.actionFingerprints.slice(-3);
  if (recent.length === 3 && new Set(recent).size === 1)
    return "Stopped safely because Nexus repeated the same action without making progress.";
  return "";
}

export function addAgentObservation(
  run: SchoolAgentRun,
  observation: SchoolAgentObservation,
  action?: SchoolAiAction,
): SchoolAgentRun {
  return {
    ...run,
    status: "working",
    step: observation.step,
    observations: [...run.observations, observation].slice(-8),
    actionFingerprints: action
      ? [...run.actionFingerprints, actionFingerprint(action)].slice(-8)
      : run.actionFingerprints,
    summary: observation.summary,
    clarification: null,
  };
}
