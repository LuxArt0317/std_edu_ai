import type { ScholarshipRecords } from '../src/services/scholarship';
export function mapScholarshipRecords(periods:Record<string,unknown>[],applications:Record<string,unknown>[]):ScholarshipRecords;
export function isScholarshipRecordQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function answerScholarshipRecords(question:string,snapshot:any,route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;
