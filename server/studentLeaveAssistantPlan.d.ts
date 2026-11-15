import type { studentLeaveLookupContext } from './studentLeaveEvidenceIntent.js';
export type StudentLeaveAssistantPlan = ReturnType<typeof studentLeaveLookupContext> & {
  feeQuestion:string; feeLabel:string|null; classQuestion:string; gradeQuestion:string; hasOtherQuestion:boolean;
};
export function studentLeaveAssistantPlan(question:string,route:string,history:Array<{role:string;content:string}>):StudentLeaveAssistantPlan|null;
export function studentLeaveSelectedTools(plan:StudentLeaveAssistantPlan):Array<'leaveRecords'|'charges'|'courses'|'dtmGradeReport'>;
export function studentLeaveBoundary(plan:StudentLeaveAssistantPlan,question:string):string;
export function studentLeaveNavigation(plan:StudentLeaveAssistantPlan,question:string):{status:string;answer:string;citations:Array<{title:string;url:string}>;suggestedQuestions:string[];grounding:{source:string;webSearched:false}}|null;
