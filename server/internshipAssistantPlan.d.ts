import type { InternshipHistory,InternshipLookupContext } from './internshipEvidenceIntent.js';
export type InternshipAssistantPlan=InternshipLookupContext&{
  feeQuestion:string;feeLabel:string|null;feeFirst:boolean;classQuestion:string;gradeQuestion:'';hasOtherQuestion:boolean;
};
export function internshipAssistantPlan(question:string,route:string,history:InternshipHistory):InternshipAssistantPlan|null;
export function internshipSelectedTools(plan:InternshipAssistantPlan):Array<'internshipRecords'|'charges'|'courses'>;
export function internshipUnavailable(plan:InternshipAssistantPlan):boolean;
export function internshipBoundary(plan:InternshipAssistantPlan,question:string):string;
export function internshipGuestAnswer(plan:InternshipAssistantPlan,question:string):{status:'handoff'|'clarification';answer:string;
  citations:Array<{chunkId:string;title:string;url:string;claim:string;sourceName:string}>;suggestedQuestions:string[];grounding:{source:'directory';webSearched:false}};
export const internshipEvidenceUrls:readonly string[];
