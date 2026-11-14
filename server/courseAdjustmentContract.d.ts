export const adjustmentScope: 'course-adjustment';
export const adjustmentNoticeScope: 'late-add-notice';
export const adjustmentAction: 'set_course_adjustment_eligibility';
export type AdjustmentPhase = 'add_drop' | 'late_add' | 'summer';
export const summerNoticeScope:'summer-selection-notice';
export type AdjustmentDecision = 'eligible' | 'ineligible' | 'unverified' | 'missing_college';
export const adjustmentPaths: Record<AdjustmentPhase,string>;
export const adjustmentPhases: AdjustmentPhase[];
export const adjustmentDecisions: AdjustmentDecision[];
export interface AdjustmentRow {
  user_id: string;
  phase: AdjustmentPhase;
  academic_year: number;
  semester: number;
  decision: AdjustmentDecision;
  checked_on: string;
  version: number;
}
export type AdjustmentPayload = Omit<AdjustmentRow,'checked_on'|'version'> & {expected_version:number;request_id:string};
export interface AdjustmentNotice {
  observed_on: string;
  rules_zh: string[];
  rules_en: string[];
  selection_notes: string[];
  fee_notes: string[];
}
export function validAcademicYear(year:unknown):boolean;
export function adjustmentTerm(instant?:Date,phase?:AdjustmentPhase): {academicYear:number;semester:number};
export function validAdjustmentSelector(phase:unknown,year:unknown,semester:unknown): phase is AdjustmentPhase;
export function validAdjustmentPayload(row:unknown): row is AdjustmentPayload;
export function parseAdjustmentRow(row:unknown,userId:string,phase:AdjustmentPhase,year:number,semester:number): AdjustmentRow;
export function adjustmentQuestion(question:string): AdjustmentPhase | 'rules' | null;

export interface SummerNotice {
  academic_year:number;
  published_on:string;
  source_url:string;
  fee_per_unit:number;
  minimum_paid_students:number;
  registration_rules_zh:string[];
  registration_rules_en:string[];
}
export function summerSelectionQuestion(question:string):
  | {view:'mine'|'notice';year?:number;ambiguousYear:boolean}
  | {view:'navigation'}
  | null;
