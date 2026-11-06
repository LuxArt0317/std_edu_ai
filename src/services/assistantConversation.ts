import type { AssistantProgress, AssistantResponse } from './researchAssistant';

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
const statuses = new Set(['running','complete','unavailable']);
const answerStatuses = new Set(['answered','clarification','abstained','handoff']);

function cleanProgress(value: unknown): AssistantProgress | null {
  if (!value || typeof value !== 'object') return null;
  const step = value as Record<string,unknown>;
  if (typeof step.kind !== 'string' || typeof step.label !== 'string' || typeof step.detail !== 'string' || !statuses.has(String(step.status))) return null;
  return {kind:step.kind.slice(0,40),label:step.label.slice(0,120),detail:step.detail.slice(0,500),status:step.status as AssistantProgress['status']};
}

export function mergeAssistantActivity(current: AssistantProgress[] = [], incoming: AssistantProgress[] = []): AssistantProgress[] {
  const steps = current.map(cleanProgress).filter((step):step is AssistantProgress=>Boolean(step));
  for (const raw of incoming) {
    const step = cleanProgress(raw);
    if (!step) continue;
    const index = steps.findIndex(item => item.kind === step.kind);
    if (index < 0) steps.push(step);
    else steps[index] = step;
  }
  return steps.slice(-12);
}

export function finishAssistantActivity(steps: AssistantProgress[], interrupted = false): AssistantProgress[] {
  return steps.map(step => step.status === 'running'
    ? {...step,status:'unavailable' as const,detail:`${step.detail} ${interrupted ? 'The response was interrupted.' : 'No completion update was received.'}`.slice(0,500)}
    : step);
}

function cleanResult(value: unknown): AssistantResponse | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as Record<string,unknown>;
  if (typeof result.answer !== 'string' || !answerStatuses.has(String(result.status))) return undefined;
  const grounding = result.grounding && typeof result.grounding === 'object' ? result.grounding as Record<string,unknown> : null;
  const citations = Array.isArray(result.citations) ? result.citations.slice(0,12).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const citation = value as Record<string,unknown>;
    if (typeof citation.url !== 'string' || !(/^(https?:\/\/|\/(?!\/))/.test(citation.url)) || typeof citation.title !== 'string') return [];
    return [{chunkId:String(citation.chunkId||citation.url).slice(0,200),claim:String(citation.claim||'').slice(0,300),title:citation.title.slice(0,200),sourceName:String(citation.sourceName||'').slice(0,160),url:citation.url.slice(0,2000),locator:typeof citation.locator==='string'?citation.locator.slice(0,500):null,effectiveAt:typeof citation.effectiveAt==='string'?citation.effectiveAt.slice(0,50):null,reviewedAt:typeof citation.reviewedAt==='string'?citation.reviewedAt.slice(0,50):null}];
  }) : [];
  return {
    answer:result.answer.slice(0,7000),status:result.status as AssistantResponse['status'],citations,
    suggestedQuestions:Array.isArray(result.suggestedQuestions)?result.suggestedQuestions.filter((item):item is string=>typeof item==='string').slice(0,3).map(item=>item.slice(0,180)):[],
    activity:mergeAssistantActivity([],Array.isArray(result.activity)?result.activity:[]),
    ...(grounding?{grounding:{source:typeof grounding.source==='string'?grounding.source.slice(0,80):undefined,webSearched:grounding.webSearched===true,checkedAt:typeof grounding.checkedAt==='string'?grounding.checkedAt.slice(0,50):undefined,degraded:grounding.degraded===true}}:{}),
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
    id:message.id.slice(0,100),role,
    content:interrupted && message.phase==='working' && role==='assistant' ? 'This answer was interrupted by navigation or refresh. Please ask again.' : message.content.slice(0,7000),
    ...(role==='assistant'?{phase,activity,result:cleanResult(message.result),actionExpired:message.actionExpired===true || Boolean(message.result && typeof message.result==='object' && (message.result as Record<string,unknown>).proposedAction)}:{}),
    ...(role==='user' && Array.isArray(message.images)?{images:message.images.slice(0,2).flatMap(value=>value&&typeof value==='object'&&typeof (value as {name?:unknown}).name==='string'?[{name:(value as {name:string}).name.slice(0,120)}]:[])}:{}),
  };
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
    return stored.messages.slice(-MAX_CONVERSATION_MESSAGES).map(value=>cleanMessage(value,true)).filter((message):message is AssistantMessage=>Boolean(message));
  } catch { return []; }
}

export function saveAssistantConversation(scope: string, messages: AssistantMessage[]): void {
  try {
    let safe = messages.slice(-MAX_CONVERSATION_MESSAGES).map(value=>cleanMessage(value)).filter((message):message is AssistantMessage=>Boolean(message));
    let serialized = JSON.stringify({scope,messages:safe});
    while (serialized.length > 180_000 && safe.length > 1) {
      safe = safe.slice(1);
      serialized = JSON.stringify({scope,messages:safe});
    }
    if (serialized.length <= 180_000) window.sessionStorage.setItem(key,serialized);
  } catch { /* A blocked or full store must not prevent chat. */ }
}

export function clearAssistantConversation(): void {
  try { window.sessionStorage.removeItem(key); } catch { /* Chat also clears its in-memory state. */ }
}
