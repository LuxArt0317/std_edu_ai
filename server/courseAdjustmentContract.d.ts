export const adjustmentScope: 'course-adjustment';
export const adjustmentNoticeScope: 'late-add-notice';
export const adjustmentAction: 'set_course_adjustment_eligibility';
export type AdjustmentPhase = 'add_drop' | 'late_add';
export type AdjustmentDecision = 'eligible' | 'ineligible' | 'unverified';
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
export function adjustmentTerm(instant?:Date): {academicYear:number;semester:number};
export function validAdjustmentSelector(phase:unknown,year:unknown,semester:unknown): phase is AdjustmentPhase;
export function validAdjustmentPayload(row:unknown): row is AdjustmentPayload;
export function parseAdjustmentRow(row:unknown,userId:string,phase:AdjustmentPhase,year:number,semester:number): AdjustmentRow;
export function adjustmentQuestion(question:string): AdjustmentPhase | 'rules' | null;
