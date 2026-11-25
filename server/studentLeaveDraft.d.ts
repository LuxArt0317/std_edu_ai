export const studentLeaveDraftAction:'create_student_leave_draft';
export const studentLeaveDraftCategories:Record<string,[string,string]>;
export type StudentLeaveDraft={
  starts_on:string;
  ends_on:string;
  leave_category:string;
  periods:string;
  leave_time_period:string;
  notes:string;
};
export type StudentLeaveDraftIntent={
  kind:typeof studentLeaveDraftAction;
  draft:StudentLeaveDraft|null;
  ambiguous:boolean;
};
export function validStudentLeaveDraft(value:unknown):value is StudentLeaveDraft;
export function parseStudentLeaveDraft(command:string):StudentLeaveDraftIntent|null;
