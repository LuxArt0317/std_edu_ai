export function fallbackPrivateAnswer(question:string,snapshot:Record<string,unknown>):string;
export type PrivateAffairsAnswer = {answer:string;status:string;grounding:{source:string;webSearched:boolean;checkedAt:string;degraded:boolean};proposedAction?:{kind:string;label:string;payload:Record<string,string>};citations:unknown[];suggestedQuestions:string[];activity:unknown[]};
export function answerPrivateAffairsQuestion(question:string,snapshot:Record<string,unknown>,history?:Array<{role:string;content:string}>,route?:string,options?:{draftOnly?:boolean}):Promise<PrivateAffairsAnswer>;
