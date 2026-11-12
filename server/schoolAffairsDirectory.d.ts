export type DirectoryEntry = {group:string;kind:string;section:string;title:string;officialUrl:string;localUrl:string};
export type DirectoryAnswer = {status:'answered';answer:string;citations:Array<{chunkId:string;claim:string;title:string;sourceName:string;url:string;locator:string|null;effectiveAt:null;reviewedAt:null}>;suggestedQuestions:string[];grounding:{source:'directory';webSearched:false;checkedAt:string};activity:Array<{kind:string;label:string;detail:string;status:'complete'}>};
export const directoryEntries: DirectoryEntry[];
export function answerDirectoryQuestion(question:string,route?:string): DirectoryAnswer|null;
export function answerCampusNavigation(question:string): DirectoryAnswer|null;
