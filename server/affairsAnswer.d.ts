export function fallbackPrivateAnswer(question:string,snapshot:Record<string,unknown>):string;
export type AccountQuestionIntent = {kind:'records'|'coaching'|'mixed';recognized:boolean;contextQuestion:string;baseTools:string[];overview:boolean;currentCourses:boolean;courseTerms:string[];year:boolean;explicitDtm:boolean;scheduleWeekday:number|null};
/** Conservative understood intent and minimum dependencies, not authorization. */
export function accountQuestionIntent(question:string,history?:Array<{role:string;content:string}>,route?:string):AccountQuestionIntent;
export function isCurrentStudyRecordQuestion(intent:AccountQuestionIntent,question:string):boolean;
export type PrivateAffairsAnswer = {answer:string;status:string;grounding:{source:string;webSearched:boolean;checkedAt:string;degraded:boolean};proposedAction?:{kind:string;label:string;payload:Record<string,string>};citations:unknown[];suggestedQuestions:string[];activity:unknown[]};
export function answerPrivateAffairsQuestion(question:string,snapshot:Record<string,unknown>,history?:Array<{role:string;content:string}>,route?:string,options?:{draftOnly?:boolean}):Promise<PrivateAffairsAnswer>;
