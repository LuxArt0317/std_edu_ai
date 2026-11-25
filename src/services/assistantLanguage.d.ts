export type AssistantLanguage='en'|'zh-Hant';
export function requestedAssistantLanguage(text:unknown):AssistantLanguage|null;
export function assistantLanguage(question?:string,history?:Array<{role:string;content:string}>):AssistantLanguage;
export function languageOnlyRequest(text:unknown):AssistantLanguage|null;
