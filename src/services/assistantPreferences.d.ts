export type AssistantPreferences={model:string;thinking:'auto'|'low'|'medium'|'high'};
export const assistantThinkingLevels:AssistantPreferences['thinking'][];
export const defaultAssistantPreferences:AssistantPreferences;
export function sanitizeAssistantPreferences(value:unknown):AssistantPreferences|null;
export type AssistantCommandChoice={kind:'query'|'model'|'thinking';value:string;label:string};
export function assistantCommandChoices(query:string,models?:string[]):AssistantCommandChoice[];
export function parseAssistantCommand(text:string,models?:string[]):{kind:'none'}|{kind:'pick';query:string}|{kind:'set';field:'model'|'thinking';value:string}|{kind:'error';message:string};
