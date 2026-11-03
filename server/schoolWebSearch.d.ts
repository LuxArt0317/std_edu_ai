export type WebCitation = {chunkId:string;claim:string;title:string;sourceName:string;url:string;locator:null;effectiveAt:null;reviewedAt:null;origin:'web'};
export type WebAnswer = {answer:string;citations:WebCitation[];origin:'web';checkedAt:string;officialOnly:boolean};
export function questionKind(question:string): {personal:boolean;irrelevant:boolean;greeting:boolean;capabilities:boolean;fresh:boolean;school:boolean};
export function publicSchoolQuestion(question:string,history?:Array<{role:string;content:string}>):string|null;
export function safeWebSource(value:string):string|null;
export function searchSchoolWeb(question:string,options?:{deadline?:number}):Promise<{result:WebAnswer|null;attempted:boolean}>;
