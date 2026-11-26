import type {AssistantProgress} from './researchAssistant';
export type QueuedAssistantTurn={id:string;text:string;images:Array<{name:string;dataUrl:string}>};
export const MAX_QUEUED_ASSISTANT_TURNS=10;
/** Commentary follows meaningful changes, never a heartbeat or ordinary tool calls. */
export function meaningfulAssistantUpdate(step:AssistantProgress){
 return step.kind==='source-coverage'||step.kind==='clarification-request'||step.status==='unavailable'&&['api-answer-check','answer-compose'].includes(step.kind);
}
export function enqueueAssistantTurn(queue:QueuedAssistantTurn[],turn:QueuedAssistantTurn){
 if(queue.length>=MAX_QUEUED_ASSISTANT_TURNS)throw Error('The queue is full. Remove a queued message or wait for one to finish.');
 return [...queue,turn];
}
