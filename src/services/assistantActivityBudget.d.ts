export const MAX_ASSISTANT_ACTIVITY:64;
export const MAX_ASSISTANT_RECORD_COLUMNS:8;
export const ASSISTANT_ACTIVITY_BYTES:16000;
export const ASSISTANT_CONVERSATION_BYTES:170000;
export function boundedAssistantText(value:unknown,maximum:number):string;
export type BoundedAssistantProgress={kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'};
export function boundedAssistantActivity(current?:unknown,incoming?:unknown,options?:{budget?:number}):BoundedAssistantProgress[];
/** Final-snapshot replay in canonical order, retaining streamed-only activity. */
export function reconcileAssistantActivity(current?:unknown,finalSnapshot?:unknown,options?:{budget?:number}):BoundedAssistantProgress[];
export function boundedConversationMessages<T extends {role:string}>(messages:T[],options?:{budget?:number}):T[];
