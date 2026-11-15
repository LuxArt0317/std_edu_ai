import type { AssistantProgress, AssistantResponse } from './researchAssistant';
import {MAX_ASSISTANT_RECORD_COLUMNS,boundedAssistantActivity,boundedAssistantText,boundedConversationMessages,reconcileAssistantActivity} from './assistantActivityBudget.js';

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  phase?: 'working' | 'complete' | 'error';
  activity?: AssistantProgress[];
  result?: AssistantResponse;
  actionExpired?: boolean;
  images?: Array<{name:string;dataUrl?:string}>;
};

export const MAX_CONVERSATION_MESSAGES = 24;
const key = 'stu-campus-assistant-conversation-v1';
const answerStatuses = new Set(['answered','clarification','abstained','handoff']);

export function mergeAssistantActivity(current: AssistantProgress[] = [], incoming: AssistantProgress[] = []): AssistantProgress[] {
  return boundedAssistantActivity(current,incoming);
}

/** A final response replays its complete trace, rather than adding new events. */
export function mergeFinalAssistantActivity(current: AssistantProgress[] = [], snapshot: AssistantProgress[] = []): AssistantProgress[] {
  return reconcileAssistantActivity(current,snapshot);
}

export function finishAssistantActivity(steps: AssistantProgress[], interrupted = false): AssistantProgress[] {
  return boundedAssistantActivity([],steps.map(step => step.status === 'running'
    ? {...step,status:'unavailable' as const,detail:`${step.detail} ${interrupted ? 'The response was interrupted.' : 'No completion update was received.'}`}
    : step));
}

function cleanResult(value: unknown): AssistantResponse | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as Record<string,unknown>;
  if (typeof result.answer !== 'string' || !answerStatuses.has(String(result.status))) return undefined;
  const grounding = result.grounding && typeof result.grounding === 'object' ? result.grounding as Record<string,unknown> : null;
  const verification = result.verification && typeof result.verification === 'object' ? result.verification as Record<string,unknown> : null;
  const citations = Array.isArray(result.citations) ? result.citations.slice(0,12).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const citation = value as Record<string,unknown>;
    if (typeof citation.url !== 'string' || !(/^(https?:\/\/|\/(?!\/))/.test(citation.url)) || typeof citation.title !== 'string') return [];
    return [{chunkId:boundedAssistantText(String(citation.chunkId||citation.url),200),claim:boundedAssistantText(String(citation.claim||''),300),title:boundedAssistantText(citation.title,200),sourceName:boundedAssistantText(String(citation.sourceName||''),160),url:boundedAssistantText(citation.url,2000),locator:boundedAssistantText(citation.locator,500)||null,effectiveAt:boundedAssistantText(citation.effectiveAt,50)||null,reviewedAt:boundedAssistantText(citation.reviewedAt,50)||null}];
  }) : [];
  return {
    answer:boundedAssistantText(result.answer,8000),status:result.status as AssistantResponse['status'],citations,
    ...(Array.isArray(result.views)?{views:result.views.slice(0,3).flatMap(raw=>{
      if(!raw||typeof raw!=='object')return [];
      const view=raw as Record<string,unknown>;
      if(typeof view.url!=='string'||!/^\/(?!\/)/.test(view.url)||!Array.isArray(view.columns)||!Array.isArray(view.rows))return [];
      return [{id:boundedAssistantText(String(view.id),60),title:boundedAssistantText(String(view.title),100),url:boundedAssistantText(view.url,500),columns:view.columns.slice(0,MAX_ASSISTANT_RECORD_COLUMNS).map(item=>boundedAssistantText(String(item),100)),rows:view.rows.slice(0,12).filter(Array.isArray).map(row=>row.slice(0,MAX_ASSISTANT_RECORD_COLUMNS).map(item=>boundedAssistantText(String(item),200))),total:Math.max(0,Number(view.total)||0),checkedAt:boundedAssistantText(String(view.checkedAt),60),note:boundedAssistantText(String(view.note),400)}];
    })}:{}),
    suggestedQuestions:Array.isArray(result.suggestedQuestions)?result.suggestedQuestions.filter((item):item is string=>typeof item==='string').slice(0,3).map(item=>boundedAssistantText(item,180)):[],
    activity:mergeAssistantActivity([],Array.isArray(result.activity)?result.activity:[]),
    ...(verification && ['verified','unverified'].includes(String(verification.status)) && Number.isInteger(verification.attempts) && Number(verification.attempts)>=0 && Number(verification.attempts)<=2
      ? {verification:{status:verification.status as 'verified'|'unverified',attempts:Number(verification.attempts)}} : {}),
    ...(grounding?{grounding:{source:boundedAssistantText(grounding.source,80),webSearched:grounding.webSearched===true,checkedAt:boundedAssistantText(grounding.checkedAt,50),degraded:grounding.degraded===true}}:{}),
  };
}

function cleanMessage(value: unknown, interrupted = false): AssistantMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string,unknown>;
  if (typeof message.id !== 'string' || !['user','assistant'].includes(String(message.role)) || typeof message.content !== 'string') return null;
  const role = message.role as AssistantMessage['role'];
  const phase = message.phase === 'working' ? (interrupted ? 'error' : 'working') : message.phase === 'error' ? 'error' : 'complete';
  const observed = mergeAssistantActivity([],Array.isArray(message.activity)?message.activity:[]);
  const activity = interrupted && message.phase === 'working' ? finishAssistantActivity(observed,true) : observed;
  return {
    id:boundedAssistantText(message.id,100),role,
    content:interrupted && message.phase==='working' && role==='assistant' ? 'This answer was interrupted by navigation or refresh. Please ask again.' : boundedAssistantText(message.content,8000),
    ...(role==='assistant'?{phase,activity,result:cleanResult(message.result),actionExpired:message.actionExpired===true || Boolean(message.result && typeof message.result==='object' && (message.result as Record<string,unknown>).proposedAction)}:{}),
    ...(role==='user' && Array.isArray(message.images)?{images:message.images.slice(0,2).flatMap(value=>value&&typeof value==='object'&&typeof (value as {name?:unknown}).name==='string'?[{name:boundedAssistantText((value as {name:string}).name,120)}]:[])}:{}),
  };
}

/** Persistence excludes image bytes, provider tokens and executable actions. */
export function sanitizeAssistantMessages(value: unknown, interrupted = false): AssistantMessage[] {
  return Array.isArray(value)?boundedConversationMessages(value.map(item=>cleanMessage(item,interrupted)).filter((item):item is AssistantMessage=>Boolean(item))):[];
}

export function readAssistantConversation(scope: string): AssistantMessage[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const stored = JSON.parse(raw) as {scope?:unknown;messages?:unknown};
    if (stored.scope !== scope || !Array.isArray(stored.messages)) {
      window.sessionStorage.removeItem(key);
      return [];
    }
    return sanitizeAssistantMessages(stored.messages,true);
  } catch { return []; }
}

export function saveAssistantConversation(scope: string, messages: AssistantMessage[]): void {
  try {
    const safe = sanitizeAssistantMessages(messages);
    const serialized = JSON.stringify({scope,messages:safe});
    if (new TextEncoder().encode(serialized).byteLength <= 180_000) window.sessionStorage.setItem(key,serialized);
  } catch { /* A blocked or full store must not prevent chat. */ }
}

export function clearAssistantConversation(): void {
  try { window.sessionStorage.removeItem(key); } catch { /* Chat also clears its in-memory state. */ }
}
