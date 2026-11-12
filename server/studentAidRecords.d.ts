import type {StudentAidRecords} from '../src/services/studentAid';
export const studentAidNavigation:{id:string;match:RegExp;title:string[];officialUrl:string;localUrl:string;description:string[]};
export function mapStudentAidRecords(rows:Record<string,unknown>[]):StudentAidRecords;
export function isStudentAidRecordQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function answerStudentAidRecords(question:string,snapshot:any,route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;
