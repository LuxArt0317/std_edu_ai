export function isDtmGradeReportEvidenceQuestion(question: unknown, route?: string, history?: Array<{role:string;content:string}>): boolean;
export function shouldReadNativeDtmGrades(question: unknown, route?: string, history?: Array<{role:string;content:string}>): boolean;
export function isForeignDtmGradesQuestion(question: unknown, route?: string): boolean;
export function needsSeparateDtmTracker(question: unknown, route?: string, history?: Array<{role:string;content:string}>): boolean;
export function isNativeDtmGradeOnlyQuestion(question: unknown, route?: string, history?: Array<{role:string;content:string}>): boolean;
export function asksOnlyDtmCourseTotal(question: unknown): boolean;
export function selectExactDtmGradeReportFields(question: unknown):
  {scope:'all'|'followup'|'named'|'total';fields:Array<'gradeText'|'feedbackText'|'weightText'>}|null;
