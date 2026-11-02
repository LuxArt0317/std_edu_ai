export function assistantDatabaseConfiguration(): {
  url: string | undefined;
  key: string | undefined;
};
export function callerRest(
  path: string,
  authorization?: string,
  init?: RequestInit,
): Promise<unknown>;
export function loadAssistantContext(
  user: { id: string; role: string },
  authorization: string,
  view?: unknown,
  question?: string,
): Promise<Record<string, unknown>>;

export function schoolCalendarDate(date?:Date):string;
