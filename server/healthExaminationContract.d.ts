export const healthExaminationPath:string;
export const healthCardUrl:string;
export const healthExaminationScope:'health-examinations';
export const healthReportBucket:'affairs-health-reports';
export const healthPageSize:25;
export const healthReportLimit:10485760;
export type HealthExamination={id:string;examination_code:string;student_number:string;student_name:string;class_label:string;report_available:boolean};
export type HealthExaminationResult={userId:string;total:number;rows:HealthExamination[]};
export function healthReportId(value:unknown):value is string;
export function validHealthReportUrl(url:URL,origin:string,userId:string,reportId:string):boolean;
export function validHealthExaminations(value:unknown,userId:string):value is HealthExaminationResult;
export function healthExaminationQuestion(question:string):boolean;
export function healthExaminationGuide(question:string,signedIn?:boolean):{
  status:'answered'|'handoff';answer:string;
  citations:Array<{chunkId:string;claim:string;title:string;url:string;sourceName:string;locator:null;effectiveAt:null;reviewedAt:null}>;
  suggestedQuestions:string[];grounding:{source:string;webSearched:boolean};
};
