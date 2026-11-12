type Turn = {role:string;content:string};
type RecordAnswer = {answer:string;url:string;title:string};
export function isDtmRecordQuestion(question:string,route?:string,history?:Turn[]):boolean;
export function answerDtmRecords(question:string,snapshot:Record<string,unknown>,route?:string,history?:Turn[]):RecordAnswer|null;
export function answerStudentServiceRecords(question:string,snapshot:Record<string,unknown>):RecordAnswer|null;
