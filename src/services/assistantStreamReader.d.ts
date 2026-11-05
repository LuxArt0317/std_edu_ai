export type AssistantStreamProgress={kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'};
export function readAssistantReply(response:Response,onProgress?:(step:AssistantStreamProgress)=>void):Promise<unknown>;
