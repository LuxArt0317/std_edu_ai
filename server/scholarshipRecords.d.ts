import type { ScholarshipRecords } from '../src/services/scholarship';
export function scholarshipPageGuide():{title:string;url:string;menu:string[];sections:Array<Record<string,unknown>>;statusMeaning:Record<string,string>;missingData:string}|null;
export function mapScholarshipRecords(periods:Record<string,unknown>[],applications:Record<string,unknown>[]):ScholarshipRecords;
export function isScholarshipRecordQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function answerScholarshipRecords(question:string,snapshot:any,route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;
