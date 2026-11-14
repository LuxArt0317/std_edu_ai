export const venuePaths:{apply:string;schedule:string;manage:string};
export const venuePeriods:Array<[string,string]>;
export function venueCode(value:unknown):value is string;
export function venueDate(value:unknown):value is string;
export function moveVenueDate(date:string,days:number):string;
export function venueWeek(date?:string):string;
export function venueScheduleSelection(params:URLSearchParams):{code:string;week:string}|null;
export function venueQuestion(question:string):{view:'mine'|'schedule'|'apply';code?:string;date?:string}|null;
