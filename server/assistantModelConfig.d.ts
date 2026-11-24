export function withAssistantModel<T>(
  settings: { model: string; reasoning?: "low" | "medium" | "high" },
  work: () => T,
): T;
export function assistantModelOverride(): string | undefined;
export function assistantReasoningOverride():
  | "low"
  | "medium"
  | "high"
  | undefined;
