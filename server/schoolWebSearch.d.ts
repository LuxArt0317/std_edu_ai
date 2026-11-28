export type WebCitation = {chunkId:string;claim:string;title:string;sourceName:string;url:string;locator:null;effectiveAt:null;reviewedAt:null;origin:'web'};
export type WebAnswer = {answer:string;citations:WebCitation[];origin:'web';checkedAt:string;officialOnly:boolean};
export function questionKind(question:string): {personal:boolean;irrelevant:boolean;greeting:boolean;capabilities:boolean;fresh:boolean;school:boolean};
export function publicSchoolQuestion(question:string,history?:Array<{role:string;content:string}>):string|null;
export function safeWebSource(value:string):string|null;
/** checkedSchoolUrls contains independently read live public pages for this request only. */
export function searchSchoolWeb(question:string,options?:{deadline?:number;general?:boolean;followUp?:boolean;deeperDiscovery?:boolean;alternateDiscovery?:boolean;libraryScope?:boolean;responseLanguage?:'en'|'zh-Hant';checkedSchoolUrls?:readonly string[]}):Promise<{result:WebAnswer|null;attempted:boolean;discoveredSources?:WebCitation[]}>;
