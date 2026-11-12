import type {CreditLoadHistoryRecords} from '../src/services/creditLoadHistory';
export const creditLoadHistoryNavigation:{id:string;match:RegExp;title:string[];officialUrl:string;localUrl:string;description:string[]};
export function mapCreditLoadHistory(rows:Record<string,unknown>[]):CreditLoadHistoryRecords;
export function isCreditLoadHistoryQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function answerCreditLoadHistory(question:string,snapshot:{profile?:{userId?:string};creditLoadHistory?:CreditLoadHistoryRecords},route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;
