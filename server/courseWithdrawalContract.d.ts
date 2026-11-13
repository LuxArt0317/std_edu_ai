export const withdrawalPath: '/school-affairs/services/6-4';
export const withdrawalScope: 'course-withdrawal';
export const withdrawalChange: 'change_course_withdrawal';
export const withdrawalWindowChange: 'set_course_withdrawal_window';
export type WithdrawalTerm = {academicYear:number;semester:number};
export type WithdrawalWindow = {opensAt:string;closesAt:string;version:number};
export type WithdrawalCourse = {
  id:string;term_course_code:string;course_title:string;required_elective_text:string|null;credits:number;
  instructor_one:string|null;remark_text:string|null;version:number;
};
export type WithdrawalSnapshot = WithdrawalTerm & {
  userId:string;state:'unconfigured'|'scheduled'|'open'|'closed';window:WithdrawalWindow|null;courses:WithdrawalCourse[];
};
export type WithdrawalAction = {course_id:string;operation:'withdraw'|'restore';expected_version:number;request_id:string};
export type WithdrawalWindowAction = {academic_year:number;semester:number;opens_at:string;closes_at:string;expected_version:number;request_id:string};
export type WithdrawalReceipt = {userId:string;requestId:string;courseId:string;version:number;remark:'Y(W)'|null};
export type WithdrawalWindowReceipt = WithdrawalTerm & {userId:string;requestId:string;window:WithdrawalWindow};
export type WithdrawalAnswer = 'window'|'records'|'guide';
export function validWithdrawalTerm(year:unknown,semester:unknown):boolean;
export function withdrawalTime(value:string):string|null;
export function withdrawalTaipeiInput(value:string):string;
export function validWithdrawalPayload(kind:unknown,payload:unknown):boolean;
export function parseWithdrawalSnapshot(data:unknown,userId:string,term?:WithdrawalTerm):WithdrawalSnapshot;
export function parseWithdrawalReceipt(data:unknown,userId:string,kind:typeof withdrawalChange,payload:WithdrawalAction):WithdrawalReceipt;
export function parseWithdrawalReceipt(data:unknown,userId:string,kind:typeof withdrawalWindowChange,payload:WithdrawalWindowAction):WithdrawalWindowReceipt;
export function withdrawalQuestion(question:string):WithdrawalAnswer|null;
