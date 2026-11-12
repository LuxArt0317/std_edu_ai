import type {HousingRecords} from '../src/services/housing.ts';
export function mapHousingRecords(periods:Record<string,unknown>[],applications:Record<string,unknown>[],assignments:Record<string,unknown>[]):HousingRecords;
export function isHousingRecordQuestion(question:string,route?:string,history?:Array<{role:string;content:string}>):boolean;
export function answerHousingRecords(question:string,snapshot:any,route?:string,history?:Array<{role:string;content:string}>):{answer:string;title:string;url:string}|null;
